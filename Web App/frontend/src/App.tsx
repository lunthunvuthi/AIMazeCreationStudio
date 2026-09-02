import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth'
import { authConfigError } from './auth/authConfig'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import MazeTypeHomePage from './pages/MazeTypeHomePage'
import NewLevelPage from './pages/NewLevelPage'
import ModifyMazePage from './pages/ModifyMazePage'
import LevelDashboardPage from './pages/LevelDashboardPage'
import QuestionEntryPage from './pages/QuestionEntryPage'
import ManualWizardPage from './pages/ManualWizardPage'
import RandomizeResultPage from './pages/RandomizeResultPage'
// Spike-only route, not part of the product's real navigation — see
// src/spike/PdfPreviewSpikePage.tsx's header comment and
// Web App/spikes/pdf-renderer/README.md. Remove this route (and src/spike/)
// once the renderer-technology decision (pdf_export_spec.md §7 item 5) lands.
import PdfPreviewSpikePage from './spike/PdfPreviewSpikePage'

// Roadmap step 7a wraps the product routes in RequireAuth. `/login` and
// `/spike/pdf-preview` stay outside it — RequireAuth's header comment explains
// why the preview route in particular must stay public.

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-red-700">Configuration error</h1>
      <p className="mt-4 text-slate-700">{message}</p>
    </main>
  )
}

function App() {
  // A production build with no Auth0 settings refuses to render rather than
  // falling back to the development bypass. See auth/authConfig.ts.
  if (authConfigError) return <ConfigErrorScreen message={authConfigError} />

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/spike/pdf-preview" element={<PdfPreviewSpikePage />} />

      <Route
        path="/*"
        element={
          <RequireAuth>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/:mazeTypeId" element={<MazeTypeHomePage />} />
              <Route path="/:mazeTypeId/new" element={<NewLevelPage />} />
              <Route path="/:mazeTypeId/modify" element={<ModifyMazePage />} />
              <Route path="/:mazeTypeId/dashboard" element={<LevelDashboardPage />} />
              <Route path="/:mazeTypeId/dashboard/:questionId" element={<QuestionEntryPage />} />
              <Route path="/:mazeTypeId/dashboard/:questionId/create" element={<ManualWizardPage />} />
              <Route path="/:mazeTypeId/dashboard/:questionId/randomize" element={<RandomizeResultPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </RequireAuth>
        }
      />
    </Routes>
  )
}

export default App
