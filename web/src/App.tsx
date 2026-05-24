import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ViewPage from './pages/ViewPage'
import NotFound from './pages/NotFound'
import CommitsListPage from './pages/git/CommitsListPage'
import CommitDetailPage from './pages/git/CommitDetailPage'
import StatusPage from './pages/git/StatusPage'
import { GitInfoProvider } from './git/GitInfoContext'
import GitGate from './git/GitGate'

export default function App() {
  return (
    <BrowserRouter>
      <GitInfoProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<ViewPage />} />
            <Route path="view/*" element={<ViewPage />} />
            <Route path="git/commits" element={<GitGate><CommitsListPage /></GitGate>} />
            <Route path="git/commits/:sha" element={<GitGate><CommitDetailPage /></GitGate>} />
            <Route path="git/status" element={<GitGate><StatusPage /></GitGate>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </GitInfoProvider>
    </BrowserRouter>
  )
}
