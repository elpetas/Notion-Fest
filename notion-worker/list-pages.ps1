# Lists all child pages inside the NOTION_PAGE_ID from your .env
# Usage: .\list-pages.ps1

$envFile = Join-Path (Split-Path $PSScriptRoot) ".env"
$pageId = $null

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^NOTION_PAGE_ID\s*=\s*(.+)$') {
      $pageId = $Matches[1].Trim()
    }
  }
}

if (-not $pageId) {
  Write-Error "NOTION_PAGE_ID not found in .env"
  exit 1
}

Write-Host "Listing child pages in: $pageId" -ForegroundColor Cyan
Write-Host ""

$env:NOTION_API_KEY = (Get-Content $envFile | Where-Object { $_ -match '^NOTION_API_KEY\s*=\s*(.+)$' } | ForEach-Object { 
  if ($_ -match '^NOTION_API_KEY\s*=\s*(.+)$') { $Matches[1].Trim() }
}) -join ''

$env:NOTION_PAGE_ID = $pageId

node -e @"
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

(async () => {
  try {
    const page = await notion.pages.retrieve({ page_id: process.env.NOTION_PAGE_ID });
    console.log('Current page:', page.properties?.title?.title?.[0]?.plain_text || 'Untitled');
    console.log('');
    
    const children = await notion.blocks.children.list({ block_id: process.env.NOTION_PAGE_ID });
    
    console.log('Child pages:');
    console.log('');
    
    for (const block of children.results) {
      if (block.type === 'child_page') {
        const cleanId = block.id.replace(/-/g, '');
        console.log('  📄', block.child_page.title);
        console.log('     ID:', cleanId);
        console.log('');
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
"@
