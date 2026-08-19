import { Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
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

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/:mazeTypeId" element={<MazeTypeHomePage />} />
      <Route path="/:mazeTypeId/new" element={<NewLevelPage />} />
      <Route path="/:mazeTypeId/modify" element={<ModifyMazePage />} />
      <Route path="/:mazeTypeId/dashboard" element={<LevelDashboardPage />} />
      <Route path="/:mazeTypeId/dashboard/:questionId" element={<QuestionEntryPage />} />
      <Route path="/:mazeTypeId/dashboard/:questionId/create" element={<ManualWizardPage />} />
      <Route path="/:mazeTypeId/dashboard/:questionId/randomize" element={<RandomizeResultPage />} />
      <Route path="/spike/pdf-preview" element={<PdfPreviewSpikePage />} />
    </Routes>
  )
}

export default App
