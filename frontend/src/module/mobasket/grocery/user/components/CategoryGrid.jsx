export default function CategoryGrid({ items }) {
  return (
    <div className="grid grid-cols-3 gap-4 px-4">
      {items.map((item, i) => (
        <div
          key={i}
          className="bg-[#eef6f4] rounded-xl p-3 flex flex-col items-center text-center"
        >
          <img
            src={item.image}
            alt={item.title}
            className="w-16 h-16 object-contain mb-2"
          />
          <p className="text-xs font-medium">{item.title}</p>
        </div>
      ))}
    </div>
  );
}
