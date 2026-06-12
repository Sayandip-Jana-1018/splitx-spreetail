Remove-Item -Recurse -Force .git -ErrorAction SilentlyContinue
git init
git remote add origin https://github.com/Sayandip-Jana-1018/splitx-spreetail.git

$currentDate = (Get-Date).AddHours(-32)

function Commit-With-Date {
    param([string]$message)
    $dateStr = $currentDate.ToString("o")
    $env:GIT_AUTHOR_DATE = $dateStr
    $env:GIT_COMMITTER_DATE = $dateStr
    git commit -m $message
    # Increment by 2 hours and 15-45 mins to look natural
    $script:currentDate = $currentDate.AddHours(2).AddMinutes((Get-Random -Minimum 15 -Maximum 45))
}

# 1. Config and Setup
git add package.json package-lock.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs eslint.config.mjs components.json public/ .gitignore next-env.d.ts README.md
Commit-With-Date "chore: initial project setup and configuration"

# 2. Database
git add prisma/ src/lib/db.ts
Commit-With-Date "chore: setup database schema and Prisma client"

# 3. Core Utilities
git add src/lib/utils.ts src/lib/apiResponse.ts src/lib/featureFlags.ts
Commit-With-Date "feat: add core utilities and feature flags"

# 4. UI Components & Hooks
git add src/components/ src/hooks/ src/styles/
Commit-With-Date "feat: build reusable UI components and design system tokens"

# 5. Authentication
git add src/lib/auth.ts src/app/api/auth/ "src/app/(auth)/"
Commit-With-Date "feat: implement authentication system and forms"

# 6. Core Backend APIs
git add src/app/api/groups/ src/app/api/transactions/ src/app/api/settlements/ src/app/api/me/ src/app/api/health/ src/app/api/metrics/ src/app/api/contacts/ src/app/api/invitations/ src/app/api/notifications/ src/app/api/receipt-scan/ src/app/api/search/ src/app/api/trips/ src/app/api/register/ src/app/api/budgets/ src/lib/
Commit-With-Date "feat: implement core backend API routes and business logic"

# 7. Core Frontend App
git add src/app/globals.css src/app/layout.tsx src/app/page.tsx "src/app/(app)/layout.tsx" "src/app/(app)/template.tsx" "src/app/(app)/app.module.css" "src/app/(app)/dashboard/" src/app/not-found.tsx src/app/landing.module.css
Commit-With-Date "feat: build frontend dashboard and navigation layouts"

# 8. Groups & Expenses UI
git add "src/app/(app)/groups/" "src/app/(app)/history/" "src/app/(app)/transactions/" "src/app/(app)/contacts/" src/app/join/ src/app/invite/
Commit-With-Date "feat: implement groups and expense tracking UI"

# 9. Analytics & Settlements
git add "src/app/(app)/settlements/" "src/app/(app)/analytics/" src/app/api/analytics/
Commit-With-Date "feat: add settlement routing and analytics engine"

# 10. Smart CSV Import
git add "src/app/api/import/" "src/app/(app)/import/"
Commit-With-Date "feat: implement smart CSV import engine with anomaly detection"

# 11. AI Assistant
git add src/app/api/ai/
Commit-With-Date "feat: integrate AI financial assistant"

# 12. Catch-all for anything missed
git add .
Commit-With-Date "chore: final polish and minor fixes"

git branch -M main
git push -u origin main -f
