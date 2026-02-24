const tabs = [
  "All",
  "Valentine's",
  "Winter",
  "Electronics",
  "Beauty",
];

export default function HeroSection() {
  return (
    <div className="bg-[#b57a2a] px-4 pt-4 pb-6 text-white rounded-b-3xl">
      {/* Top info */}
      <div className="flex justify-between items-center mb-3">
        <div>
          <p className="text-sm opacity-90">MoBasket in</p>
          <h1 className="text-3xl font-bold">8 minutes</h1>
          <p className="text-xs opacity-90">Pipliyahana, Indore</p>
        </div>

        <div className="w-9 h-9 bg-white/20 rounded-full" />
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl flex items-center px-3 py-2 mb-4">
        <input
          type="text"
          placeholder='Search "power bank"'
          className="w-full text-black outline-none text-sm"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-6 overflow-x-auto no-scrollbar">
        {tabs.map((tab, i) => (
          <button
            key={i}
            className={`text-sm whitespace-nowrap pb-2 ${
              i === 0
                ? "border-b-2 border-white font-semibold"
                : "opacity-80"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
