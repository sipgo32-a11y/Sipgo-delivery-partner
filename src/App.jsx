import { useState } from 'react'
import './App.css'

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [online, setOnline] = useState(true)

  if (!loggedIn) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="logo">S</div>
          <h1>SIPGO</h1>
          <p className="subtitle">Delivery Partner</p>

          <input placeholder="Mobile number" type="tel" />
          <input placeholder="Password" type="password" />

          <button className="primary" onClick={() => setLoggedIn(true)}>
            Login
          </button>

          <p className="login-help">Delivery Partner Login</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <div className="brand">SIPGO</div>
          <div className="welcome">Welcome, Delivery Partner</div>
        </div>

        <button
          className={online ? 'status online' : 'status offline'}
          onClick={() => setOnline(!online)}
        >
          <span></span>
          {online ? 'Online' : 'Offline'}
        </button>
      </header>

      <main>
        <section className="profile-card">
          <div className="avatar">DP</div>
          <div className="profile-info">
            <h2>Delivery Partner</h2>
            <p>Partner ID: SIPGO-DP-001</p>
            <p>⭐ 5.0 Rating</p>
          </div>
          <button className="profile-btn">Profile</button>
        </section>

        <section className="stats">
          <div>
            <strong>0</strong>
            <span>Today's Orders</span>
          </div>
          <div>
            <strong>₹0</strong>
            <span>Today's Earnings</span>
          </div>
          <div>
            <strong>0</strong>
            <span>Completed</span>
          </div>
        </section>

        <section className="section-title">
          <h2>Assigned Bookings</h2>
          <span>0 Orders</span>
        </section>

        <section className="empty-card">
          <div className="empty-icon">🛵</div>
          <h3>No new bookings</h3>
          <p>
            New delivery bookings will appear here when a merchant confirms
            an order.
          </p>
        </section>

        <section className="quick-actions">
          <button>📦 My Orders</button>
          <button>💰 Earnings</button>
          <button>📍 Location</button>
          <button>☎️ Support</button>
        </section>
      </main>

      <nav className="bottom-nav">
        <button className="active">⌂<span>Home</span></button>
        <button>📦<span>Orders</span></button>
        <button>💰<span>Earnings</span></button>
        <button>👤<span>Profile</span></button>
      </nav>
    </div>
  )
}

export default App
