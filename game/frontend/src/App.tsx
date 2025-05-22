import { useState, useEffect, useRef } from 'react';
import { HubConnectionBuilder, HubConnection } from '@microsoft/signalr';
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
  const connectionRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    if (joined && !connectionRef.current) {
      const connection = new HubConnectionBuilder()
        .withUrl('https://localhost:5001/gamehub') // Adjust port if needed
        .withAutomaticReconnect()
        .build();

      connection.on('PlayerJoined', (playerName: string) => {
        setPlayers(prev => {
          if (prev.find(p => p.name === playerName)) return prev;
          return [...prev, { name: playerName }];
        });
      });

      connection.start().then(() => {
        connection.invoke('JoinGame', name);
      });

      connectionRef.current = connection;
    }
    // Cleanup on unmount
    return () => {
      connectionRef.current?.stop();
      connectionRef.current = null;
    };
  }, [joined, name]);

  // Simulate joining and waiting for a second player
  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setJoined(true);
      setPlayers([{ name }]);
    }
  };

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
