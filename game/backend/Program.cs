using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(builder =>
    {
        builder.WithOrigins("http://localhost:5173") // Add your frontend URL
               .AllowAnyHeader()
               .AllowAnyMethod()
               .AllowCredentials();
    });
});
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Order matters - UseRouting first, then CORS, then endpoints
app.UseRouting();
app.UseCors();
app.UseHttpsRedirection();

// SignalR hub endpoint
app.MapHub<GameHub>("/gamehub");

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast =  Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

app.Run();

public class GameHub : Hub
{
    // In-memory player list for demo (not for production)
    private static ConcurrentDictionary<string, string> Players = new(); // ConnectionId -> Name
    // Track player turns
    private static ConcurrentDictionary<string, bool> PlayerTurns = new(); // ConnectionId -> IsMyTurn

    public async Task JoinGame(string playerName)
    {
        Players[Context.ConnectionId] = playerName;
        await Groups.AddToGroupAsync(Context.ConnectionId, "BattleshipRoom");
        
        // Set turn for first player who joins
        if (Players.Count == 1)
        {
            PlayerTurns[Context.ConnectionId] = true;
        }
        else if (Players.Count == 2)
        {
            // Make sure second player's turn is set to false
            var firstPlayer = Players.Keys.First();
            if (firstPlayer != Context.ConnectionId)
            {
                PlayerTurns[firstPlayer] = true;
                PlayerTurns[Context.ConnectionId] = false;
                
                // Notify players about whose turn it is
                await Clients.Client(firstPlayer).SendAsync("YourTurn");
                await Clients.Client(Context.ConnectionId).SendAsync("OpponentTurn");
            }
        }
        
        await BroadcastPlayers();
    }

    public async Task MakeMove(int row, int col)
    {
        // Check if it's this player's turn
        if (!PlayerTurns.TryGetValue(Context.ConnectionId, out bool isMyTurn) || !isMyTurn)
        {
            return; // Not your turn
        }

        // Find the opponent
        string? opponentConnectionId = null;
        foreach (var connectionId in Players.Keys)
        {
            if (connectionId != Context.ConnectionId)
            {
                opponentConnectionId = connectionId;
                break;
            }
        }

        if (opponentConnectionId != null)
        {
            // Send move to opponent
            await Clients.Client(opponentConnectionId).SendAsync("OpponentMove", row, col);
            
            // Switch turns
            PlayerTurns[Context.ConnectionId] = false;
            PlayerTurns[opponentConnectionId] = true;
            
            // Notify players about turn change
            await Clients.Client(opponentConnectionId).SendAsync("YourTurn");
            await Clients.Client(Context.ConnectionId).SendAsync("OpponentTurn");
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Players.TryRemove(Context.ConnectionId, out _);
        PlayerTurns.TryRemove(Context.ConnectionId, out _);
        await BroadcastPlayers();
        await base.OnDisconnectedAsync(exception);
    }

    private Task BroadcastPlayers()
    {
        var playerNames = Players.Values.ToArray();
        return Clients.Group("BattleshipRoom").SendAsync("PlayerList", playerNames);
    }
}

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
