#!/bin/bash

# List of HTML files to update
files=(
  "index.html"
  "business.html"
  "caffeine-tracker.html"
  "caffeine.html"
  "creator.html"
  "finance.html"
  "goals.html"
  "gym.html"
  "macros.html"
  "progress.html"
  "supplements.html"
  "water.html"
  "whoop.html"
  "_template.html"
)

# The script tag to add (before </body>)
analytics_script='<script type="module" src="analytics.js"></script>'

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Check if analytics.js is already added
    if grep -q "analytics.js" "$file"; then
      echo "⏭️  $file already has analytics.js, skipping"
    else
      # Add the script tag before </body>
      sed -i 's|</body>|'"$analytics_script"'\n</body>|' "$file"
      echo "✅ Added analytics to $file"
    fi
  else
    echo "⚠️  $file not found"
  fi
done

echo ""
echo "✨ Vercel Analytics has been added to all HTML files!"
