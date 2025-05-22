import { useState, useEffect, useRef } from 'react';
import { HubConnectionBuilder, HubConnection, HttpTransportType } from '@microsoft/signalr';
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
  const connectionRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    if (joined && !connectionRef.current) {
      const connection = new HubConnectionBuilder()
        .withUrl('https://localhost:7224/gamehub', { // Updated port from launchSettings.json
          skipNegotiation: true,
          transport: HttpTransportType.WebSockets
        })
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

  // Render battleship grid and ships to place
  return (
    <div className="game-container">
      <h2>Battleship: Place Your Ships</h2>
      <div className="battleship-layout">
        <div className="battleship-grid">
          {Array.from({ length: GRID_SIZE }).map((_, row) => (
            <div className="battleship-row" key={row}>
              {Array.from({ length: GRID_SIZE }).map((_, col) => (
                <div className="battleship-cell" key={col}></div>
              ))}
            </div>
          ))}
        </div>
        <div className="ships-to-place">
          <h3>Ships to Place</h3>
          <ul>
            {SHIPS.map(ship => (
              <li key={ship.id} className="ship-item">
                <span className="ship-name">{ship.name}</span>
                <span className="ship-size">{'■'.repeat(ship.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
