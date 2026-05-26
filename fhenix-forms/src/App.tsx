import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import FormBuilder from './pages/FormBuilder'
import FormRespond from './pages/FormRespond'
import FormResults from './pages/FormResults'

export default function App() {
  return (
    <Routes>
      <Route index element={<Landing />} />
      <Route element={<Layout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="create" element={<FormBuilder />} />
        <Route path="f/:formId" element={<FormRespond />} />
        <Route path="f/:formId/results" element={<FormResults />} />
      </Route>
    </Routes>
  )
}
