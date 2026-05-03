import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AttendancePage from './pages/AttendancePage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import JudgingPage from './pages/JudgingPage';
import Navbar from './components/Navbar';
import LeaderboardPage from './pages/LeaderboardPage';

function App() {
  return (
    <BrowserRouter>

      <Navbar />

      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* ONLY Clerks and Admins can see Attendance */}
        <Route path="/attendance" element={
          <ProtectedRoute allowedRoles={['admin', 'clerk']}>
            <AttendancePage />
          </ProtectedRoute>
        } />

        {/* ONLY Judges and Admins can see Judging */}
        <Route path="/judge" element={
          <ProtectedRoute allowedRoles={['admin', 'judge']}>
            <JudgingPage />
          </ProtectedRoute>
        } />

        {/* ONLY Admins can see the Full Leaderboard */}
        <Route path="/leaderboard" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <LeaderboardPage />
          </ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;