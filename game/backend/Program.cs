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

    public async Task JoinGame(string playerName)
    {
        Players[Context.ConnectionId] = playerName;
        await Groups.AddToGroupAsync(Context.ConnectionId, "BattleshipRoom");
        await BroadcastPlayers();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Players.TryRemove(Context.ConnectionId, out _);
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
