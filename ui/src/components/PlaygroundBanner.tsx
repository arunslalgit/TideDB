import { FlaskConical, ExternalLink, Download } from 'lucide-react';
import { basePath } from '../config';

const isGitHubPages = window.location.hostname.endsWith('.github.io');

// On GitHub Pages, derive the repo URL from the hostname + first path segment.
// e.g. arunslalgit.github.io/TideDB → github.com/arunslalgit/TideDB
function getRepoUrl(): string {
  const user = window.location.hostname.split('.')[0];
  const repo = window.location.pathname.split('/')[1];
  return `https://github.com/${user}/${repo}`;
}

export default function PlaygroundBanner() {
  return (
    <div className="bg-gradient-to-r from-amber-600/90 to-orange-600/90 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm flex-shrink-0">
      <div className="flex items-center gap-2">
        <FlaskConical size={16} className="flex-shrink-0" />
        <span className="font-medium">Playground Mode</span>
        <span className="hidden sm:inline text-white/80">
          &mdash; Exploring with sample data. To use your own databases, run the binary and add your DB connections.
        </span>
      </div>
      {isGitHubPages ? (
        <a
          href={getRepoUrl() + '/releases'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap"
        >
          Get the Binary
          <Download size={12} />
        </a>
      ) : (
        <a
          href={basePath + '/ui/'}
          className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap"
        >
          Connect Real DB
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}
