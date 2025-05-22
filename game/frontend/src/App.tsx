import { useState, useEffect, useRef } from 'react';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import './App.css';

// Types for player and ship
interface Player {
  name: string;
}

interface Ship {
  id: number;
  name: string;
  size: number;
}

interface PlacedShip {
  ship: Ship;
  row: number;
  col: number;
  horizontal: boolean;
}

const SHIPS: Ship[] = [
  { id: 1, name: 'Carrier', size: 5 },
  { id: 2, name: 'Battleship', size: 4 },
  { id: 3, name: 'Cruiser', size: 3 },
  { id: 4, name: 'Submarine', size: 3 },
  { id: 5, name: 'Destroyer', size: 2 },
];

const GRID_SIZE = 10;

function App() {
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([]);
  const [isHorizontal, setIsHorizontal] = useState(true);
  const [moves, setMoves] = useState<{ row: number; col: number }[]>([]);
  const [isMyTurn, setIsMyTurn] = useState(() => {
    // If player is first in the list, assume they start (frontend fallback)
    return false;
  });
  const [opponentMoves, setOpponentMoves] = useState<{ row: number; col: number }[]>([]);
  const connectionRef = useRef<HubConnection | null>(null);

  const allShipsPlaced = placedShips.length === SHIPS.length;

  useEffect(() => {
    if (joined && !connectionRef.current) {
      const connection = new HubConnectionBuilder()
        .withUrl('http://localhost:5062/gamehub')
        .configureLogging(LogLevel.Information)
        .withAutomaticReconnect()
        .build();

      // Connection event handlers
      connection.onclose(error => {
        console.error('Connection closed:', error);
        setConnectionError('Connection to game server lost');
      });

      // Listen for player list updates
      connection.on('PlayerList', (playerNames: string[]) => {
        console.log('Received player list:', playerNames);
        setPlayers(playerNames.map(name => ({ name })));
      });

      // Listen for turn updates
      connection.on('YourTurn', () => setIsMyTurn(true));
      connection.on('OpponentTurn', () => setIsMyTurn(false));
      // Listen for opponent move
      connection.on('OpponentMove', (row: number, col: number) => {
        setOpponentMoves(moves => [...moves, { row, col }]);
        setIsMyTurn(true);
      });

      // Start connection
      connection.start()
        .then(() => {
          console.log('Connected to SignalR hub');
          connection.invoke('JoinGame', name)
            .catch(err => {
              console.error('Error invoking JoinGame:', err);
              setConnectionError('Failed to join game');
            });
        })
        .catch(err => {
          console.error('Connection failed:', err);
          setConnectionError('Failed to connect to game server');
        });

      connectionRef.current = connection;
    }
    
    // Cleanup on unmount
    return () => {
      if (connectionRef.current) {
        connectionRef.current.stop()
          .catch(err => console.error('Error stopping connection:', err));
        connectionRef.current = null;
      }
    };
  }, [joined, name]);

  useEffect(() => {
    // If all ships are placed and there are 2 players, and no turn event received, set first player's turn as fallback
    if (allShipsPlaced && players.length === 2 && moves.length === 0 && opponentMoves.length === 0) {
      if (players[0]?.name === name) {
        setIsMyTurn(true);
      } else if (players[1]?.name === name) {
        setIsMyTurn(false);
      }
    }
  }, [allShipsPlaced, players, name, moves.length, opponentMoves.length]);

  // Handle join form submission
  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setJoined(true);
    }
  };

  // Render connection error
  if (connectionError) {
    return (
      <div className="error-container">
        <h2>Connection Error</h2>
        <p>{connectionError}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  // Render join form
  if (!joined) {
    return (
      <div className="join-container">
        <h1>Battleship Online</h1>
        <form onSubmit={handleJoin} className="join-form">
          <label htmlFor="name">Enter your name:</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoFocus
          />
          <button type="submit" disabled={!name.trim()}>Join Game</button>
        </form>
      </div>
    );
  }

  // Wait for second player
  if (players.length < 2) {
    return (
      <div className="game-container">
        <h2>Welcome, {name}!</h2>
        <p>Waiting for another player to join...</p>
        <p className="player-status">Connected players: {players.length}/2</p>
        {players.length > 0 && (
          <div className="player-list">
            <h3>Players:</h3>
            <ul>
              {players.map((player, index) => (
                <li key={index}>{player.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Send move to backend
  const handleMove = (row: number, col: number) => {
    if (!allShipsPlaced || !isMyTurn) return;
    if (moves.some(m => m.row === row && m.col === col)) return;
    setMoves([...moves, { row, col }]);
    setIsMyTurn(false);
    if (connectionRef.current) {
      connectionRef.current.invoke('MakeMove', row, col);
    }
  };

  // Render battleship grid and ships to place
  const handleCellClick = (row: number, col: number) => {
    if (!selectedShip) return;
    // Check if ship fits and does not overlap
    const positions = Array.from({ length: selectedShip.size }, (_, i) =>
      isHorizontal ? [row, col + i] : [row + i, col]
    );
    if (
      positions.some(
        ([r, c]) =>
          r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE ||
          placedShips.some(ps => {
            const psPositions = Array.from({ length: ps.ship.size }, (_, i) =>
              ps.horizontal ? [ps.row, ps.col + i] : [ps.row + i, ps.col]
            );
            return psPositions.some(([pr, pc]) => pr === r && pc === c);
          })
        )
    ) {
      return; // Invalid placement
    }
    setPlacedShips([...placedShips, { ship: selectedShip, row, col, horizontal: isHorizontal }]);
    setSelectedShip(null);
  };

  const isCellOccupied = (row: number, col: number) => {
    return placedShips.some(ps => {
      const psPositions = Array.from({ length: ps.ship.size }, (_, i) =>
        ps.horizontal ? [ps.row, ps.col + i] : [ps.row + i, ps.col]
      );
      return psPositions.some(([pr, pc]) => pr === row && pc === col);
    });
  };

  const shipsToPlace = SHIPS.filter(ship => !placedShips.some(ps => ps.ship.id === ship.id));

  // Place ships randomly
  const placeShipsRandomly = () => {
    const newPlacedShips: PlacedShip[] = [];
    const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
    for (const ship of SHIPS) {
      let placed = false;
      for (let attempts = 0; attempts < 100 && !placed; attempts++) {
        const horizontal = Math.random() < 0.5;
        const maxRow = horizontal ? GRID_SIZE : GRID_SIZE - ship.size + 1;
        const maxCol = horizontal ? GRID_SIZE - ship.size + 1 : GRID_SIZE;
        const row = Math.floor(Math.random() * maxRow);
        const col = Math.floor(Math.random() * maxCol);
        // Check if space is free
        let fits = true;
        for (let i = 0; i < ship.size; i++) {
          const r = horizontal ? row : row + i;
          const c = horizontal ? col + i : col;
          if (grid[r][c]) {
            fits = false;
            break;
          }
        }
        if (fits) {
          for (let i = 0; i < ship.size; i++) {
            const r = horizontal ? row : row + i;
            const c = horizontal ? col + i : col;
            grid[r][c] = true;
          }
          newPlacedShips.push({ ship, row, col, horizontal });
          placed = true;
        }
      }
    }
    setPlacedShips(newPlacedShips);
    setSelectedShip(null);
  };

  return (
    <div className="game-container">
      <h2>{allShipsPlaced ? (isMyTurn ? 'Your Turn: Make a Move' : "Opponent's Turn") : 'Battleship: Place Your Ships'}</h2>
      <div className="battleship-layout">
        <div className="battleship-grid">
          {Array.from({ length: GRID_SIZE }).map((_, row) => (
            <div className="battleship-row" key={row}>
              {Array.from({ length: GRID_SIZE }).map((_, col) => {
                const occupied = isCellOccupied(row, col);
                let shipSymbol = '';
                if (occupied) {
                  const ps = placedShips.find(ps => {
                    const psPositions = Array.from({ length: ps.ship.size }, (_, i) =>
                      ps.horizontal ? [ps.row, ps.col + i] : [ps.row + i, ps.col]
                    );
                    return psPositions.some(([pr, pc]) => pr === row && pc === col);
                  });
                  if (ps) {
                    shipSymbol = '■';
                  }
                }
                // Show move marker if move was made
                const myMove = moves.find(m => m.row === row && m.col === col);
                const oppMove = opponentMoves.find(m => m.row === row && m.col === col);
                return (
                  <div
                    className={`battleship-cell${occupied ? ' occupied' : ''}${selectedShip ? ' placeable' : ''}${allShipsPlaced ? ' move-phase' : ''}`}
                    key={col}
                    onClick={() => {
                      if (!allShipsPlaced) handleCellClick(row, col);
                      else handleMove(row, col);
                    }}
                    style={{ cursor: allShipsPlaced && isMyTurn ? (!myMove ? 'crosshair' : 'not-allowed') : (selectedShip ? 'pointer' : 'default') }}
                  >
                    {myMove ? <span className="move-marker">X</span> : oppMove ? <span className="opponent-move-marker">O</span> : shipSymbol}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {!allShipsPlaced && (
          <div className="ships-to-place">
            <h3>Ships to Place</h3>
            <ul>
              {shipsToPlace.map(ship => (
                <li
                  key={ship.id}
                  className={`ship-item${selectedShip?.id === ship.id ? ' selected' : ''}`}
                  onClick={() => setSelectedShip(ship)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="ship-name">{ship.name}</span>
                  <span className="ship-size">{'■'.repeat(ship.size)}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => setIsHorizontal(h => !h)}>
              Orientation: {isHorizontal ? 'Horizontal' : 'Vertical'}
            </button>
            <button onClick={placeShipsRandomly} style={{ marginLeft: 8 }}>
              Place Ships Randomly
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
