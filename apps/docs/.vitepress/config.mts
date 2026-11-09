import { defineConfig } from 'vitepress';

// Served next to the web app on GitHub Pages: https://fosay-labs.github.io/fosay-app/docs/
// DOCS_BASE overrides the path (for example `/` when previewing locally).
const base = process.env.DOCS_BASE ?? '/fosay-app/docs/';

export default defineConfig({
  base,
  title: 'FOSAY',
  description: 'Funds Only Spent After Yes: a Stellar wallet you share with your AI agent.',
  lang: 'en-US',
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: `${base}icon.svg` }]],
  themeConfig: {
    logo: '/icon.svg',
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Protocol', link: '/protocol/rules-and-mandates' },
      { text: 'Contracts', link: '/contracts/mandate-policy' },
      { text: 'Developers', link: '/developers/local-setup' },
      { text: 'Open the app', link: 'https://fosay-labs.github.io/fosay-app/' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'How a payment works', link: '/guide/how-it-works' },
        ],
      },
      {
        text: 'Using FOSAY',
        items: [
          { text: 'Wallet owners', link: '/users/owner' },
          { text: 'Agent operators', link: '/users/agent-operator' },
        ],
      },
      {
        text: 'Protocol',
        items: [
          { text: 'Rules and mandates', link: '/protocol/rules-and-mandates' },
          { text: 'Approval requests', link: '/protocol/approvals' },
          { text: 'Costs and who pays', link: '/protocol/costs' },
          { text: 'Security model', link: '/protocol/security' },
        ],
      },
      {
        text: 'Contract reference',
        items: [
          { text: 'fosay-mandate-policy', link: '/contracts/mandate-policy' },
          { text: 'fosay-approvals', link: '/contracts/approvals' },
          { text: 'Error codes', link: '/contracts/errors' },
          { text: 'Deployments', link: '/contracts/deployments' },
        ],
      },
      {
        text: 'Developers',
        items: [
          { text: 'Local setup', link: '/developers/local-setup' },
          { text: 'SDK and agent runtime', link: '/developers/sdk' },
          { text: 'MCP server', link: '/developers/mcp' },
          { text: 'HTTP API', link: '/developers/api' },
          { text: 'Hosting', link: '/developers/hosting' },
        ],
      },
      { text: 'Contributing', link: '/contributing' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/fosay-labs' }],
    editLink: {
      pattern: 'https://github.com/fosay-labs/fosay-app/edit/main/apps/docs/:path',
      text: 'Edit this page on GitHub',
    },
    search: { provider: 'local' },
    footer: {
      message: 'Testnet only. Not audited. Apache-2.0.',
      copyright: 'FOSAY contributors',
    },
  },
});
