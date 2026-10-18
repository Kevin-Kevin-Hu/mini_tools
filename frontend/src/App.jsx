import { Routes, Route } from 'react-router-dom'
import Hub from './pages/Hub.jsx'
import ToolPage from './pages/ToolPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Hub />} />
      <Route path="/tool/:id" element={<ToolPage />} />
    </Routes>
  )
}
