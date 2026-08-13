import { useState } from 'react'

const navItems = [
  { name: 'Dashboard', icon: '📊' },
  { name: 'Daily Planner', icon: '📋' },
  { name: 'Time Log', icon: '⏱' },
  { name: 'Courses', icon: '📚' },
  { name: 'Calendar', icon: '📅' },
]

export default function Sidebar({ active, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`bg-slate-900 text-white flex flex-col transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-700">
        {!collapsed && <span className="font-bold text-lg tracking-tight">AcademeMate</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-400 hover:text-white cursor-pointer"
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map((item) => (
          <button
            key={item.name}
            onClick={() => onNavigate(item.name)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer ${
              active === item.name
                ? 'bg-slate-700 text-white font-medium'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {!collapsed && <span>{item.name}</span>}
          </button>
        ))}
      </nav>

      <div className="border-t border-slate-700 p-4 text-xs text-slate-500">
        {!collapsed && <span>v1.0.0</span>}
      </div>
    </aside>
  )
}
