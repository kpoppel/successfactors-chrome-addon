"""Shared UI helpers for TeamDB server-rendered pages."""
from __future__ import annotations


TOPBAR_STYLE = """
        .topbar {
          position: sticky;
          top: 0;
          z-index: 10;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          column-gap: 16px;
          background: #101b34;
          color: #fff;
          padding: 12px 18px;
        }
        .topbar-title {
          justify-self: start;
          font-weight: 700;
          white-space: nowrap;
        }
        .topbar-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          min-width: 0;
          justify-self: center;
        }
        .topbar-nav a,
        .topbar-nav span {
          color: #b9d5ff;
          text-decoration: none;
          white-space: nowrap;
        }
        .topbar-nav .is-hidden {
          display: none;
        }
        .topbar-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 14px;
          white-space: nowrap;
          justify-self: end;
        }
        .topbar-divider {
          width: 1px;
          align-self: stretch;
          min-height: 28px;
          background: rgba(185, 213, 255, 0.45);
        }
        .topbar-logout {
          border: 1px solid #6e83b8;
          background: transparent;
          color: #eaf1ff;
          border-radius: 999px;
          padding: 7px 14px;
          font-weight: 600;
          cursor: pointer;
        }
        @media (max-width: 780px) {
          .topbar {
            grid-template-columns: 1fr;
            justify-items: start;
            row-gap: 10px;
          }
          .topbar-nav,
          .topbar-actions {
            justify-content: flex-start;
            flex-wrap: wrap;
          }
          .topbar-divider {
            display: none;
          }
        }
"""

PAGE_SHELL_STYLE = """
  body { margin: 0; font-family: Arial, sans-serif; background: #f5f7fb; }
"""


def render_topbar_links(*, admin_logged_in: bool, external_enabled: bool) -> str:
    slots = [
        ('Calendar', '/calendar', True),
        ('Org Chart', '/orgchart', True),
        ('External Portal', '/portal/login', external_enabled),
        ('Admin', '/admin', not admin_logged_in),
        ('People', '/admin/people', admin_logged_in),
        ('Teams/Projects', '/admin/team', admin_logged_in),
        ('Absence', '/admin/absence', admin_logged_in),
    ]

    rendered: list[str] = []
    for label, href, visible in slots:
        if visible:
            rendered.append(f'<a href="{href}">{label}</a>')
        else:
            rendered.append(f'<a href="{href}" class="is-hidden" aria-hidden="true" tabindex="-1">{label}</a>')
    return ''.join(rendered)


def render_logout_action(admin_logged_in: bool, redirect_url: str = '/calendar') -> str:
    if not admin_logged_in:
        return ''
    return f'''
      <span class="topbar-divider" aria-hidden="true"></span>
      <button id="topbar-logout" class="topbar-logout" type="button">Logout</button>
      <script>
        const topbarLogoutButton = document.getElementById('topbar-logout');
        if (topbarLogoutButton) {{
          topbarLogoutButton.addEventListener('click', async () => {{
            await fetch('/api/admin/logout', {{method: 'POST'}});
            location.href = '{redirect_url}';
          }});
        }}
      </script>
    '''


def render_page_shell(
    *,
    title: str,
    topbar_title: str,
    topbar_links_html: str,
    topbar_logout_html: str = '',
    content_html: str = '',
    root_id: str = '',
    root_loading_text: str = '',
    include_uikit: bool = False,
    extra_head_html: str = '',
    extra_script_html: str = '',
) -> str:
    head_assets = ''
    if include_uikit:
        head_assets = '''
      <link rel="stylesheet" href="/addon/lib/uikit.min.css">
      <script src="/addon/lib/uikit.min.js"></script>
      <script src="/addon/lib/uikit-icons.min.js"></script>
      <script src="/addon/lib/js-yaml.min.js"></script>
    '''

    root_markup = ''
    if root_id:
        root_markup = f'<div id="{root_id}">{root_loading_text}</div>'

    return f'''
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title}</title>
      <style>
        {PAGE_SHELL_STYLE}
        {TOPBAR_STYLE}
        {extra_head_html}
      </style>
      {head_assets}
    </head>
    <body>
      <div class="topbar">
        <div class="topbar-title">{topbar_title}</div>
        <nav class="topbar-nav">{topbar_links_html}</nav>
        <div class="topbar-actions">{topbar_logout_html}</div>
      </div>
      {content_html}
      {root_markup}
      {extra_script_html}
    </body>
    </html>
    '''
