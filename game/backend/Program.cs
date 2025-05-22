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

// Serve static files from wwwroot
app.UseDefaultFiles();
app.UseStaticFiles();

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
    // Track ship positions for each player
    private static ConcurrentDictionary<string, List<ShipPosition>> PlayerShips = new(); // ConnectionId -> List of ship positions
    // Track hit and miss positions for each player
    private static ConcurrentDictionary<string, List<Position>> PlayerHits = new(); // ConnectionId -> List of hit positions
    private static ConcurrentDictionary<string, List<Position>> PlayerMisses = new(); // ConnectionId -> List of miss positions

    public async Task JoinGame(string playerName)
    {
        Players[Context.ConnectionId] = playerName;
        await Groups.AddToGroupAsync(Context.ConnectionId, "BattleshipRoom");
        
        // Initialize empty ship positions list
        PlayerShips[Context.ConnectionId] = new List<ShipPosition>();
        // Initialize empty hit and miss lists
        PlayerHits[Context.ConnectionId] = new List<Position>();
        PlayerMisses[Context.ConnectionId] = new List<Position>();
        
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
    }    public async Task PlaceShip(int shipId, string shipName, int size, int row, int col, bool horizontal)
    {
        // Check if this ship has already been placed (prevent duplicates)
        if (PlayerShips[Context.ConnectionId].Any(s => s.ShipId == shipId))
        {
            Console.WriteLine($"Ship {shipId} already placed by player {Context.ConnectionId}");
            await Clients.Caller.SendAsync("ShipPlaced", shipId);
            return;
        }
        
        var positions = new List<Position>();
        for (int i = 0; i < size; i++)
        {
            int r = horizontal ? row : row + i;
            int c = horizontal ? col + i : col;
            positions.Add(new Position { Row = r, Col = c });
        }

        PlayerShips[Context.ConnectionId].Add(new ShipPosition
        {
            ShipId = shipId,
            ShipName = shipName,
            Positions = positions
        });
        
        Console.WriteLine($"Player {Context.ConnectionId} placed ship {shipId}. Total ships: {PlayerShips[Context.ConnectionId].Count}");
        await Clients.Caller.SendAsync("ShipPlaced", shipId);
        
        // Broadcast updated player list with ship counts
        await BroadcastPlayers();
        
        // Check if both players have placed all their ships (5 ships per player)
        if (Players.Count == 2 && 
            PlayerShips.All(ps => ps.Value.Count == 5))
        {
            // Both players have placed all their ships, start the game
            Console.WriteLine("All ships placed by both players. Starting game!");
            
            // Find the first player (who should start)
            var firstPlayer = Players.Keys.First();
            var secondPlayer = Players.Keys.Skip(1).First();
            
            // Set turns
            PlayerTurns[firstPlayer] = true;
            PlayerTurns[secondPlayer] = false;
            
            // Notify players about whose turn it is
            await Clients.Client(firstPlayer).SendAsync("YourTurn");
            await Clients.Client(secondPlayer).SendAsync("OpponentTurn");
            
            // Notify all players that the game has started
            await Clients.Group("BattleshipRoom").SendAsync("GameStarted");
        }
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
            // Check if the move hit any of the opponent's ships
            bool isHit = false;
            
            if (PlayerShips.TryGetValue(opponentConnectionId, out var opponentShips))
            {
                foreach (var ship in opponentShips)
                {
                    if (ship.Positions.Any(p => p.Row == row && p.Col == col))
                    {
                        isHit = true;
                        // Add to player's hits
                        PlayerHits[Context.ConnectionId].Add(new Position { Row = row, Col = col });
                        break;
                    }
                }
            }
            
            // If not a hit, it's a miss
            if (!isHit)
            {
                PlayerMisses[Context.ConnectionId].Add(new Position { Row = row, Col = col });
            }
            
            // Send move to opponent
            await Clients.Client(opponentConnectionId).SendAsync("OpponentMove", row, col);
            
            // Send hit/miss status back to the player who made the move
            await Clients.Client(Context.ConnectionId).SendAsync("MoveResult", row, col, isHit);
            
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
        PlayerShips.TryRemove(Context.ConnectionId, out _);
        PlayerHits.TryRemove(Context.ConnectionId, out _);
        PlayerMisses.TryRemove(Context.ConnectionId, out _);
        await BroadcastPlayers();
        await base.OnDisconnectedAsync(exception);
    }    private Task BroadcastPlayers()
    {
        var playerNames = Players.Values.ToArray();
        var playerShipCounts = Players.Keys.ToDictionary(
            connectionId => Players[connectionId], 
            connectionId => PlayerShips.ContainsKey(connectionId) ? PlayerShips[connectionId].Count : 0
        );
        return Clients.Group("BattleshipRoom").SendAsync("PlayerList", playerNames, playerShipCounts);
    }
}

public class Position
{
    public int Row { get; set; }
    public int Col { get; set; }
}

public class ShipPosition
{
    public int ShipId { get; set; }
    public required string ShipName { get; set; }
    public List<Position> Positions { get; set; } = new List<Position>();
}

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
