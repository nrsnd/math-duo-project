import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './pages/App'
import Lessons from './pages/Lessons'
import Lesson from './pages/Lesson'
import Profile from './pages/Profile'
import Practice from './pages/Practice'
import Results from './pages/Results'
import './styles.css'

const router = createBrowserRouter([
  { path: '/', element: <App />, children: [
    { index: true, element: <Lessons /> },
    { path: 'lesson/:id', element: <Lesson /> },
    { path: 'results/:lessonId/:attemptId', element: <Results /> },
    { path: 'profile', element: <Profile /> },
    { path: 'practice', element: <Practice /> },
  ]}
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
