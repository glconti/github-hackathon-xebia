import { useState } from 'react'
import './App.css'

function App() {
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setJoined(true);
      // TODO: Call backend to join a game with the chosen name
    }
  };

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

  return (
    <div className="game-container">
      <h2>Welcome, {name}!</h2>
      <p>Joining a game...</p>
      {/* TODO: Show game board or waiting room here */}
    </div>
  );
}

export default App
