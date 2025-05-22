import { useState, useEffect, useRef } from 'react';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import './App.css';

// Types for player and ship
interface Player {
  name: string;
  shipsPlaced?: number;
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

// Legend component to explain cell colors
const Legend = () => {  return (
    <div className="battleship-legend">
      <h3>Galaxy Guide</h3>
      <div className="legend-items">
        <div className="legend-item">
          <div className="legend-color occupied"></div>
          <span>Your Ship</span>
        </div>
        <div className="legend-item">
          <div className="legend-color hit"></div>
          <span>Enemy Hit on Your Ship</span>
        </div>
        <div className="legend-item">
          <div className="legend-color miss"></div>
          <span>Enemy Miss</span>
        </div>
        <div className="legend-item">
          <div className="legend-color enemy-hit"></div>
          <span>Your Hit on Enemy Ship</span>
        </div>
        <div className="legend-item">
          <div className="legend-color enemy-miss"></div>
          <span>Your Miss</span>
        </div>
        <div className="legend-item">
          <div className="legend-color last-move"></div>
          <span>Last Move</span>
        </div>
      </div>
    </div>
  );
};

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
  const [moves, setMoves] = useState<{ row: number; col: number; isHit?: boolean }[]>([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [opponentMoves, setOpponentMoves] = useState<{ row: number; col: number }[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [lastMoveResult, setLastMoveResult] = useState<{ row: number; col: number; isHit: boolean } | null>(null);
  const [animatingCells, setAnimatingCells] = useState<{ key: string; type: 'splash' | 'bomb' }[]>([]);
  const connectionRef = useRef<HubConnection | null>(null);

  const allShipsPlaced = placedShips.length === SHIPS.length;

  useEffect(() => {
    if (joined && !connectionRef.current) {
      const hubUrl = 'https://xebia.conti.foo/gamehub';
      const connection = new HubConnectionBuilder()
        .withUrl(hubUrl)
        .configureLogging(LogLevel.Information)
        .withAutomaticReconnect()
        .build();      // Connection event handlers
      connection.onclose((error?: Error) => {
        console.error('Connection closed:', error);
        setConnectionError('Connection to game server lost');
      });      // Listen for player list updates
      connection.on('PlayerList', (playerNames: string[], shipCounts: Record<string, number>) => {
        console.log('Received player list:', playerNames);
        console.log('Ship counts:', shipCounts);
        setPlayers(playerNames.map(name => ({ 
          name, 
          shipsPlaced: shipCounts[name] || 0 
        })));
      });

      // Listen for turn updates
      connection.on('YourTurn', () => {
        console.log('Your turn!');
        setIsMyTurn(true);
        setGameStarted(true);
      });
      
      connection.on('OpponentTurn', () => {
        console.log('Opponent turn!');
        setIsMyTurn(false);
        setGameStarted(true);      });
        // Listen for opponent move
      connection.on('OpponentMove', (row: number, col: number) => {
        console.log('Opponent moved at:', row, col);
        setOpponentMoves(prev => [...prev, { row, col }]);
      });
        // Listen for ship placement confirmation
      connection.on('ShipPlaced', (shipId: number) => {
        console.log(`Ship ${shipId} placed successfully`);
      });
      
      // Listen for game started event
      connection.on('GameStarted', () => {
        console.log('Game has started!');
        setGameStarted(true);
      });
      
      // Listen for move result (hit or miss)
      connection.on('MoveResult', (row: number, col: number, isHit: boolean) => {
        console.log(`Move result at (${row}, ${col}): ${isHit ? 'HIT!' : 'Miss'}`);
        setLastMoveResult({ row, col, isHit });
        setMoves(prev => 
          prev.map(move => 
            move.row === row && move.col === col 
              ? { ...move, isHit } 
              : move
          )
        );
      });

      // Start connection
      connection.start()
        .then(() => {
          console.log('Connected to SignalR hub');
          connection.invoke('JoinGame', name)          .catch((err: Error) => {
            console.error('Error invoking JoinGame:', err);
            setConnectionError('Failed to join game');
          });
        })        .catch((err: Error) => {
          console.error('Connection failed:', err);
          setConnectionError('Failed to connect to game server');
        });

      connectionRef.current = connection;
    }
    
    // Cleanup on unmount
    return () => {
      if (connectionRef.current) {        connectionRef.current.stop()
          .catch((err: Error) => console.error('Error stopping connection:', err));
        connectionRef.current = null;
      }
    };
  }, [joined, name]);

  // Animation trigger for move results
  useEffect(() => {
    if (lastMoveResult) {
      const key = `${lastMoveResult.row},${lastMoveResult.col}`;
      setAnimatingCells((prev) => [
        ...prev.filter(a => a.key !== key),
        { key, type: lastMoveResult.isHit ? 'bomb' : 'splash' }
      ]);
      // Remove animation after duration
      setTimeout(() => {
        setAnimatingCells((prev) => prev.filter(a => a.key !== key));
      }, 650);
    }
  }, [lastMoveResult]);

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
    if (!allShipsPlaced || !isMyTurn || !gameStarted) return;
    if (moves.some(m => m.row === row && m.col === col)) return;
      console.log('Making move at:', row, col);
    setMoves(prev => [...prev, { row, col }]);
    
    if (connectionRef.current) {
      connectionRef.current.invoke('MakeMove', row, col)
        .catch((err: Error) => console.error('Error making move:', err));
    }
  };  // Render battleship grid and ships to place
  const handleCellClick = (row: number, col: number) => {
    if (!selectedShip) return;
    
    // Check if this ship is already placed
    if (placedShips.some(ps => ps.ship.id === selectedShip.id)) {
      console.log(`Ship ${selectedShip.name} already placed`);
      return;
    }
    
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
    
    // Update local state
    setPlacedShips([...placedShips, { ship: selectedShip, row, col, horizontal: isHorizontal }]);
    
    // Send ship placement to server
    if (connectionRef.current) {
      connectionRef.current.invoke('PlaceShip', 
        selectedShip.id, 
        selectedShip.name, 
        selectedShip.size, 
        row, 
        col, 
        isHorizontal
      ).catch((err: Error) => console.error('Error placing ship:', err));
    }
    
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
    // Clear existing placements first
    setPlacedShips([]);
    
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
          }          newPlacedShips.push({ ship, row, col, horizontal });
          placed = true;
        }
      }
    }
    
    setPlacedShips(newPlacedShips);
    setSelectedShip(null);
    
    // Send all ship placements to server
    if (connectionRef.current) {
      for (const shipPlacement of newPlacedShips) {
        connectionRef.current.invoke('PlaceShip',
          shipPlacement.ship.id,
          shipPlacement.ship.name,
          shipPlacement.ship.size,
          shipPlacement.row,
          shipPlacement.col,
          shipPlacement.horizontal
        ).catch((err: Error) => console.error('Error placing ship:', err));
      }
    }
  };  // Game status message
  let gameStatus = "";
  if (!allShipsPlaced) {
    gameStatus = `Battleship: Place Your Ships (${placedShips.length}/5)`;
  } else if (!gameStarted) {
    // Check if opponent has placed all ships
    const opponent = players.find(p => p.name !== name);
    if (opponent && opponent.shipsPlaced === 5) {
      gameStatus = "All ships placed! Game is starting...";
    } else if (opponent) {
      gameStatus = `Waiting for opponent to place ships (${opponent.shipsPlaced || 0}/5)`;
    } else {
      gameStatus = "Waiting for game to start...";
    }
  } else if (isMyTurn) {
    gameStatus = "Your Turn: Make a Move";
    // Add last move feedback if there was one
    if (lastMoveResult) {
      gameStatus += ` (Last move: ${lastMoveResult.isHit ? "HIT!" : "Miss"} at (${lastMoveResult.row}, ${lastMoveResult.col}))`;
    }
  } else {
    gameStatus = "Opponent's Turn";
    // Add last move feedback if there was one
    if (lastMoveResult) {
      gameStatus += ` (Your last move: ${lastMoveResult.isHit ? "HIT!" : "Miss"} at (${lastMoveResult.row}, ${lastMoveResult.col}))`;
    }
  }
  return (      <div className="game-container">
      <h1>BATTLESHIP</h1>
      <div className="star-character"></div>
      <div className="alien-character"></div>
      <div className="rocket"></div>
      <h2>{gameStatus}</h2>
      <div className="player-status">
        Players: {players.map(p => `${p.name} (${p.shipsPlaced || 0}/5 ships)`).join(' vs ')}
      </div>
      <div className="battleship-layout">
        <div className="battleship-grid">
          {Array.from({ length: GRID_SIZE }).map((_, row) => (
            <div className="battleship-row" key={row} data-row={row + 1}>
              {Array.from({ length: GRID_SIZE }).map((_, col) => {                const occupied = isCellOccupied(row, col);
                const myMove = moves.find(m => m.row === row && m.col === col);
                const oppMove = opponentMoves.find(m => m.row === row && m.col === col);
                
                // Check if this is the last move made by the player
                const isLastMove = lastMoveResult && lastMoveResult.row === row && lastMoveResult.col === col;
                  let cellClass = "battleship-cell";
                if (occupied) cellClass += " occupied";                if (selectedShip) cellClass += " placeable";
                if (allShipsPlaced) cellClass += " move-phase";
                if (oppMove && occupied) cellClass += " hit";
                if (oppMove && !occupied) cellClass += " miss";
                // Add hit/miss classes for player's moves
                if (myMove?.isHit === true) cellClass += " enemy-hit";
                if (myMove?.isHit === false) cellClass += " enemy-miss";
                // Add visual indicator for the last move
                if (isLastMove) cellClass += " last-move";
                // Animation classes
                const anim = animatingCells.find(a => a.key === `${row},${col}`);
                if (anim) cellClass += ` ${anim.type}`;
                
                // Cell content
                let content = "";
                if (occupied) content = "■";
                if (myMove) content = myMove.isHit === true ? "✓" : myMove.isHit === false ? "✗" : "?";
                if (oppMove) content = oppMove && occupied ? "X" : "O";
                
                return (
                  <div
                    className={cellClass}
                    key={col}
                    onClick={() => {
                      if (!allShipsPlaced) handleCellClick(row, col);
                      else if (gameStarted) handleMove(row, col);
                    }}
                    style={{ 
                      cursor: !allShipsPlaced && selectedShip ? 'pointer' : 
                              (allShipsPlaced && gameStarted && isMyTurn && !myMove ? 'crosshair' : 'default')
                    }}
                  >
                    {content}
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
      <Legend />
    </div>
  );
}

export default App;
