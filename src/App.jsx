import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Layout from './components/Layout';
import Goals from './pages/Goals';
import Move from './pages/Move';
import Food from './pages/Food';
import Books from './pages/Books';
import Profile from './pages/Profile';
import RoutineExecution from './pages/RoutineExecution';

function App() {
  const { user } = useAuth();

  return (
    <Router>
      <Routes>
        {!user ? (
          <>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        ) : (
          <>
            <Route element={<Layout />}>
              <Route path="/goals" element={<Goals />} />
              <Route path="/move" element={<Move />} />
              <Route path="/food" element={<Food />} />
              <Route path="/books" element={<Books />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route path="/routine/:routineId" element={<RoutineExecution />} />
            <Route path="*" element={<Navigate to="/goals" />} />
          </>
        )}
      </Routes>
    </Router>
  );
}

export default App;
