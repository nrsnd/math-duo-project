import { Outlet, Link, useLocation } from 'react-router-dom'

export default function App() {
  const loc = useLocation()
  return (
    <div>
      <header>
        <div className="row container">
          <Link to="/" style={{ fontWeight: 700 }}>Math Duo</Link>
          <nav>
            <Link to="/">Lessons</Link>
            <Link to="/practice">Practice</Link>
            <Link to="/profile">Profile</Link>
          </nav>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  )
}
