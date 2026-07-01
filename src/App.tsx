import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AttendancePage from './pages/AttendancePage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import JudgingPage from './pages/JudgingPage';
import Navbar from './components/Navbar';
import LeaderboardPage from './pages/LeaderboardPage';
import { useSessionGuard } from './hooks/useSessionGuard';

function AppRoutes() {
  useSessionGuard();

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/attendance" element={
          <ProtectedRoute allowedRoles={['admin', 'clerk', 'emcee']}>
            <AttendancePage />
          </ProtectedRoute>
        } />

        <Route path="/judge" element={
          <ProtectedRoute allowedRoles={['admin', 'judge']}>
            <JudgingPage />
          </ProtectedRoute>
        } />

        <Route path="/leaderboard" element={
          <ProtectedRoute allowedRoles={['admin', 'judge']}>
            <LeaderboardPage />
          </ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
