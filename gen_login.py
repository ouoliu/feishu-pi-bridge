#!/usr/bin/env python3
"""Generate a login flowchart PNG."""
import subprocess, os

W, H = 720, 1060
CX = 340

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#444"/></marker>
    <marker id="grn" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#166534"/></marker>
    <marker id="red" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#b91c1c"/></marker>
    <filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.12"/></filter>
  </defs>
  <rect width="{W}" height="{H}" fill="#f8fafc" rx="12"/>

  <!-- START -->
  <ellipse cx="{CX}" cy="50" rx="100" ry="28" fill="#fed7aa" stroke="#c2410c" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX}" y="56" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#374151" font-weight="bold">用户打开应用</text>
  <line x1="{CX}" y1="78" x2="{CX}" y2="118" stroke="#c2410c" stroke-width="2" marker-end="url(#arrow)"/>

  <!-- DECISION 1: 已登录？ -->
  <polygon points="{CX},125 {CX+90},180 {CX},235 {CX-90},180" fill="#fef3c7" stroke="#b45309" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX}" y="186" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#374151" font-weight="bold">已登录？</text>

  <!-- YES → 进入主页 -->
  <line x1="{CX+92}" y1="180" x2="{CX+180}" y2="180" stroke="#166534" stroke-width="2" marker-end="url(#grn)"/>
  <text x="{CX+136}" y="172" text-anchor="middle" font-size="13" font-family="sans-serif" fill="#166534" font-weight="bold">是</text>
  <rect x="{CX+182}" y="152" width="130" height="56" rx="8" fill="#a7f3d0" stroke="#047857" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX+247}" y="186" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#374151" font-weight="bold">进入主页</text>

  <!-- NO → 显示登录页 -->
  <line x1="{CX}" y1="237" x2="{CX}" y2="280" stroke="#b45309" stroke-width="2" marker-end="url(#arrow)"/>
  <text x="{CX+16}" y="263" text-anchor="start" font-size="13" font-family="sans-serif" fill="#b45309" font-weight="bold">否</text>
  <rect x="{CX-90}" y="282" width="180" height="50" rx="8" fill="#dbeafe" stroke="#1e3a5f" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX}" y="312" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#374151" font-weight="bold">显示登录页</text>

  <line x1="{CX}" y1="332" x2="{CX}" y2="368" stroke="#1e3a5f" stroke-width="2" marker-end="url(#arrow)"/>

  <!-- 输入账号密码 -->
  <rect x="{CX-90}" y="370" width="180" height="50" rx="8" fill="#3b82f6" stroke="#1e3a5f" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX}" y="400" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#fff" font-weight="bold">输入账号密码</text>

  <line x1="{CX}" y1="420" x2="{CX}" y2="456" stroke="#1e3a5f" stroke-width="2" marker-end="url(#arrow)"/>

  <!-- 调用登录 API -->
  <rect x="{CX-90}" y="458" width="180" height="50" rx="8" fill="#3b82f6" stroke="#1e3a5f" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX}" y="488" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#fff" font-weight="bold">调用登录 API</text>

  <line x1="{CX}" y1="508" x2="{CX}" y2="550" stroke="#b45309" stroke-width="2" marker-end="url(#arrow)"/>

  <!-- DECISION 2: 验证通过？ -->
  <polygon points="{CX},557 {CX+90},612 {CX},667 {CX-90},612" fill="#fef3c7" stroke="#b45309" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX}" y="618" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#374151" font-weight="bold">验证通过？</text>

  <!-- YES → 保存Token+跳转 -->
  <line x1="{CX+92}" y1="612" x2="{CX+180}" y2="612" stroke="#166534" stroke-width="2" marker-end="url(#grn)"/>
  <text x="{CX+136}" y="604" text-anchor="middle" font-size="13" font-family="sans-serif" fill="#166534" font-weight="bold">是</text>
  <rect x="{CX+182}" y="576" width="150" height="72" rx="8" fill="#a7f3d0" stroke="#047857" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX+257}" y="602" text-anchor="middle" font-size="14" font-family="sans-serif" fill="#374151" font-weight="bold">保存 Token</text>
  <text x="{CX+257}" y="628" text-anchor="middle" font-size="13" font-family="sans-serif" fill="#64748b">跳转主页</text>

  <!-- NO → 显示错误 -->
  <line x1="{CX}" y1="669" x2="{CX}" y2="714" stroke="#b91c1c" stroke-width="2" marker-end="url(#red)"/>
  <text x="{CX+16}" y="696" text-anchor="start" font-size="13" font-family="sans-serif" fill="#b91c1c" font-weight="bold">否</text>
  <rect x="{CX-90}" y="716" width="180" height="50" rx="8" fill="#fecaca" stroke="#b91c1c" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX}" y="746" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#374151" font-weight="bold">显示错误信息</text>

  <line x1="{CX}" y1="766" x2="{CX}" y2="808" stroke="#b45309" stroke-width="2" marker-end="url(#arrow)"/>

  <!-- DECISION 3: 是否重试？ -->
  <polygon points="{CX},815 {CX+90},870 {CX},925 {CX-90},870" fill="#fef3c7" stroke="#b45309" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX}" y="876" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#374151" font-weight="bold">是否重试？</text>

  <!-- YES → 返回重试 -->
  <path d="M{CX-92},870 L{CX-185},870 L{CX-185},395 L{CX-88},395" fill="none" stroke="#1e3a5f" stroke-width="2" stroke-dasharray="6,3" marker-end="url(#arrow)"/>
  <text x="{CX-140}" y="620" text-anchor="middle" font-size="13" font-family="sans-serif" fill="#1e3a5f" font-weight="bold">是（返回重试）</text>

  <!-- NO → 忘记密码 -->
  <line x1="{CX}" y1="927" x2="{CX}" y2="968" stroke="#b91c1c" stroke-width="2" marker-end="url(#red)"/>
  <text x="{CX+16}" y="952" text-anchor="start" font-size="13" font-family="sans-serif" fill="#b91c1c" font-weight="bold">否</text>
  <rect x="{CX-100}" y="970" width="200" height="56" rx="8" fill="#dbeafe" stroke="#1e3a5f" stroke-width="2" filter="url(#sh)"/>
  <text x="{CX}" y="1004" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#374151" font-weight="bold">忘记密码 / 注册</text>
</svg>'''

svg_path = '/Users/jet/feishu-pi-bridge/login-flow.svg'
png_path = '/Users/jet/feishu-pi-bridge/login-flow.png'

with open(svg_path, 'w') as f:
    f.write(svg)

subprocess.run(['qlmanage', '-t', '-s', '1440', '-o', '/tmp', svg_path], check=True, capture_output=True)
thumb = '/tmp/login-flow.svg.png'
if os.path.exists(thumb):
    os.rename(thumb, png_path)
    print(f'OK: {png_path}')
else:
    print(f'SVG at {svg_path}, manual conversion needed')
