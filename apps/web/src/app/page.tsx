export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-gray-50 dark:bg-[#121212]">
      <div className="max-w-4xl w-full text-center">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-primary-700 dark:text-[#39ff14]">
          Sistema de Préstamos
        </h1>
        <p className="text-base md:text-xl text-gray-600 mb-8 dark:text-white/60">
          Gestión integral de préstamos personales con sistema de amortización francés
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="p-6 border rounded-lg shadow-sm bg-white dark:bg-[#1e1e1e] dark:border-[#333333] hover:shadow-md dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.15)] transition">
            <h3 className="text-xl font-semibold mb-3 dark:text-white/[.87]">Simulador</h3>
            <p className="text-gray-600 dark:text-white/60">
              Calcula tu préstamo con nuestro simulador interactivo
            </p>
          </div>
          
          <div className="p-6 border rounded-lg shadow-sm bg-white dark:bg-[#1e1e1e] dark:border-[#333333] hover:shadow-md dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.15)] transition">
            <h3 className="text-xl font-semibold mb-3 dark:text-white/[.87]">Solicita</h3>
            <p className="text-gray-600 dark:text-white/60">
              Envía tu solicitud de préstamo en minutos
            </p>
          </div>
          
          <div className="p-6 border rounded-lg shadow-sm bg-white dark:bg-[#1e1e1e] dark:border-[#333333] hover:shadow-md dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.15)] transition">
            <h3 className="text-xl font-semibold mb-3 dark:text-white/[.87]">Gestiona</h3>
            <p className="text-gray-600 dark:text-white/60">
              Panel de administración para gestionar tu cartera
            </p>
          </div>
        </div>
        
        <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/simulator"
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition"
          >
            Probar Simulador
          </a>
          <a
            href="/login"
            className="px-6 py-3 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 dark:border-[#39ff14] dark:text-[#39ff14] dark:hover:bg-[#39ff14]/10 transition"
          >
            Iniciar Sesión
          </a>
        </div>
      </div>
    </main>
  );
}
