import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ViewPage from './pages/ViewPage'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ViewPage />} />
          <Route path="view/*" element={<ViewPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
