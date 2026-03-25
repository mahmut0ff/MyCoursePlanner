import re
import sys

def main():
    path = "src/pages/landing/LandingPage.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add top-level icons to featureCategories
    content = content.replace("id: 'core',", "id: 'core',\n      icon: Building2,")
    content = content.replace("id: 'learning',", "id: 'learning',\n      icon: BookOpen,")
    content = content.replace("id: 'exams',", "id: 'exams',\n      icon: ClipboardList,")
    content = content.replace("id: 'ai',", "id: 'ai',\n      icon: Bot,")
    content = content.replace("id: 'engagement',", "id: 'engagement',\n      icon: Gamepad2,")
    content = content.replace("id: 'certificates',", "id: 'certificates',\n      icon: FileText,")
    content = content.replace("id: 'communication',", "id: 'communication',\n      icon: MessageCircle,")
    content = content.replace("id: 'analytics',", "id: 'analytics',\n      icon: BarChart3,")

    # 2. Render the top-level icon
    # Original: <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${cat.color}`} />
    content = content.replace(
        '<div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${cat.color}`} />',
        '<cat.icon className="w-6 h-6 text-slate-700" />'
    )

    # 3. Remove DashboardMockup component
    # Find the block between HERO DASHBOARD MOCKUP and MAIN LANDING PAGE
    content = re.sub(
        r'/\* ──────────────────────────────────────────\n\s*HERO DASHBOARD MOCKUP \(CSS-based\)\n\s*────────────────────────────────────────── \*/.*?(?:/\* ──────────────────────────────────────────\n\s*MAIN LANDING PAGE)',
        '/* ──────────────────────────────────────────\n   MAIN LANDING PAGE',
        content,
        flags=re.DOTALL
    )
    # Remove its usage
    content = content.replace('<DashboardMockup />', '')

    # 4. Remove Stats section
    content = content.replace(
        '''      {/* ═══ Stats ═══ */}
      <section className="py-12 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-3xl font-extrabold bg-gradient-to-r from-primary-600 to-violet-600 bg-clip-text text-transparent">{s.value}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>''',
        ''
    )
    # Remove the stats array definition
    content = re.sub(r'\s*const stats = \[.*?\];', '', content, flags=re.DOTALL)

    # 5. Header Brand
    content = content.replace(
        '<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center">\n              <GraduationCap className="w-4.5 h-4.5 text-white" />\n            </div>\n            <span className="font-bold text-lg">MyCoursePlan</span>',
        '<img src="/icons/logo.png" alt="Planula" className="h-8 w-auto object-contain" />\n            <span className="font-bold text-xl tracking-tight">Planula</span>'
    )

    # Footer Brand
    content = content.replace(
        '<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center">\n                  <GraduationCap className="w-4.5 h-4.5 text-white" />\n                </div>\n                <span className="font-bold text-lg">MyCoursePlan</span>',
        '<img src="/icons/logo.png" alt="Planula" className="h-8 w-auto object-contain rounded-xl" />\n                <span className="font-bold text-xl tracking-tight">Planula</span>'
    )
    content = content.replace('MyCoursePlan', 'Planula')
    content = content.replace('mycoursePlan', 'planula')

    # 6. Safe Light Theme Enforcement
    # Simply remove all dark: classes globally
    content = re.sub(r'dark:[^\s"\'\}]+', '', content)
    # Cleanup extra spaces left by the above removal
    content = re.sub(r' +', ' ', content)
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
    print("UI fixed successfully!")

if __name__ == "__main__":
    main()
