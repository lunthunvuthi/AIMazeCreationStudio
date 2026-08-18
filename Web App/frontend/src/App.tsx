import { Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import MazeTypeHomePage from './pages/MazeTypeHomePage'
import NewLevelPage from './pages/NewLevelPage'
import ModifyMazePage from './pages/ModifyMazePage'
import LevelDashboardPage from './pages/LevelDashboardPage'
import QuestionEntryPage from './pages/QuestionEntryPage'
import ManualWizardPage from './pages/ManualWizardPage'
import RandomizeResultPage from './pages/RandomizeResultPage'

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
    </Routes>
  )
}

export default App
