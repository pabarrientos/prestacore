export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-4xl w-full text-center">
        <h1 className="text-5xl font-bold mb-6 text-primary-700">
          Sistema de Préstamos
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Gestión integral de préstamos personales con sistema de amortización francés
        </p>
        
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          <div className="p-6 border rounded-lg shadow-sm">
            <h3 className="text-xl font-semibold mb-3">Simulador</h3>
            <p className="text-gray-600">
              Calcula tu préstamo con nuestro simulador interactivo
            </p>
          </div>
          
          <div className="p-6 border rounded-lg shadow-sm">
            <h3 className="text-xl font-semibold mb-3">Solicita</h3>
            <p className="text-gray-600">
              Envía tu solicitud de préstamo en minutos
            </p>
          </div>
          
          <div className="p-6 border rounded-lg shadow-sm">
            <h3 className="text-xl font-semibold mb-3">Gestiona</h3>
            <p className="text-gray-600">
              Panel de administración para gestionar tu cartera
            </p>
          </div>
        </div>
        
        <div className="mt-12 flex gap-4 justify-center">
          <a
            href="/simulator"
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Probar Simulador
          </a>
          <a
            href="/login"
            className="px-6 py-3 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition"
          >
            Iniciar Sesión
          </a>
        </div>
      </div>
    </main>
  );
}
