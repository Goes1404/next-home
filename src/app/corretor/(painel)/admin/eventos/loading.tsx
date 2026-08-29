export default function CarregandoEventos() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando monitor de eventos">
      <div className="h-16 animate-pulse rounded-2xl bg-superficie" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-superficie" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-superficie" />
    </div>
  );
}
