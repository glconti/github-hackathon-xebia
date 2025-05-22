using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using BattleshipOnline.Models;

namespace BattleshipOnline.Hubs
{
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
            PlayerShips[Context.ConnectionId] = new List<ShipPosition>();
            PlayerHits[Context.ConnectionId] = new List<Position>();
            PlayerMisses[Context.ConnectionId] = new List<Position>();
            if (Players.Count == 1)
            {
                PlayerTurns[Context.ConnectionId] = true;
            }
            else if (Players.Count == 2)
            {
                var firstPlayer = Players.Keys.First();
                if (firstPlayer != Context.ConnectionId)
                {
                    PlayerTurns[firstPlayer] = true;
                    PlayerTurns[Context.ConnectionId] = false;
                    await Clients.Client(firstPlayer).SendAsync("YourTurn");
                    await Clients.Client(Context.ConnectionId).SendAsync("OpponentTurn");
                }
            }
            await BroadcastPlayers();
        }

        public async Task PlaceShip(int shipId, string shipName, int size, int row, int col, bool horizontal)
        {
            if (PlayerShips[Context.ConnectionId].Any(s => s.ShipId == shipId))
            {
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
            await Clients.Caller.SendAsync("ShipPlaced", shipId);
            await BroadcastPlayers();
            if (Players.Count == 2 && PlayerShips.All(ps => ps.Value.Count == 5))
            {
                var firstPlayer = Players.Keys.First();
                var secondPlayer = Players.Keys.Skip(1).First();
                PlayerTurns[firstPlayer] = true;
                PlayerTurns[secondPlayer] = false;
                await Clients.Client(firstPlayer).SendAsync("YourTurn");
                await Clients.Client(secondPlayer).SendAsync("OpponentTurn");
                await Clients.Group("BattleshipRoom").SendAsync("GameStarted");
            }
        }

        public async Task MakeMove(int row, int col)
        {
            if (!PlayerTurns.TryGetValue(Context.ConnectionId, out bool isMyTurn) || !isMyTurn)
                return;
            string? opponentConnectionId = Players.Keys.FirstOrDefault(id => id != Context.ConnectionId);
            if (opponentConnectionId != null)
            {
                bool isHit = false;
                if (PlayerShips.TryGetValue(opponentConnectionId, out var opponentShips))
                {
                    foreach (var ship in opponentShips)
                    {
                        if (ship.Positions.Any(p => p.Row == row && p.Col == col))
                        {
                            isHit = true;
                            PlayerHits[Context.ConnectionId].Add(new Position { Row = row, Col = col });
                            break;
                        }
                    }
                }
                if (!isHit)
                {
                    PlayerMisses[Context.ConnectionId].Add(new Position { Row = row, Col = col });
                }
                await Clients.Client(opponentConnectionId).SendAsync("OpponentMove", row, col);
                await Clients.Client(Context.ConnectionId).SendAsync("MoveResult", row, col, isHit);
                PlayerTurns[Context.ConnectionId] = false;
                PlayerTurns[opponentConnectionId] = true;
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
        }

        private Task BroadcastPlayers()
        {
            var playerNames = Players.Values.ToArray();
            var playerShipCounts = Players.Keys.ToDictionary(
                connectionId => Players[connectionId],
                connectionId => PlayerShips.ContainsKey(connectionId) ? PlayerShips[connectionId].Count : 0
            );
            return Clients.Group("BattleshipRoom").SendAsync("PlayerList", playerNames, playerShipCounts);
        }
    }
}
