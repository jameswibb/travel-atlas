import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer } from 'react-leaflet'

const EAST_COAST_CENTER = [37.5, -77.0]
const DEFAULT_ZOOM = 6

export default function App() {
  return (
    <MapContainer
      center={EAST_COAST_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ width: '100vw', height: '100vh' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
    </MapContainer>
  )
}
