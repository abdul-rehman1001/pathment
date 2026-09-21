/** Adapted from the mobile app's SummitScape; decorative, with no runtime JS. */
export function SummitBackdrop() {
  const trail = 'M96 200 C140 176 106 156 152 138 C190 124 168 108 204 94 C238 82 250 62 282 44';
  return <div className="auth-summit" aria-hidden="true">
    <svg className="auth-summit-sky" viewBox="0 0 390 560" preserveAspectRatio="xMidYMin slice" focusable="false">
      <circle cx="214" cy="318" r="286" fill="none" stroke="#d4eeea" strokeOpacity=".12" />
      {[[52,74],[130,34],[268,48],[330,112],[360,56],[26,168]].map(([x,y]) => <circle key={x} cx={x} cy={y} r="1.3" fill="#d4eeea" opacity=".35" />)}
      <circle cx="86" cy="40" r="3" fill="#d4eeea" />
    </svg>
    <svg className="auth-summit-land" viewBox="0 0 390 200" preserveAspectRatio="xMidYMax meet" focusable="false">
      <defs><radialGradient id="auth-summit-glow"><stop stopColor="#b8e5a1" stopOpacity=".32" /><stop offset="1" stopColor="#b8e5a1" stopOpacity="0" /></radialGradient></defs>
      <circle cx="282" cy="40" r="72" fill="url(#auth-summit-glow)" />
      <path d="M0 104 L44 72 L88 92 L142 48 L192 80 L238 54 L282 40 L326 74 L390 52 L390 200 L0 200Z" fill="#b9ddd4" fillOpacity=".15" />
      <path d="M0 140 L42 116 L96 142 L148 110 L204 136 L256 106 L310 132 L390 104 L390 200 L0 200Z" fill="#b9ddd4" fillOpacity=".1" />
      <path d={trail} fill="none" stroke="#b8e5a1" strokeOpacity=".12" strokeWidth="14" />
      <path d={trail} fill="none" stroke="#d4eeea" strokeOpacity=".3" strokeWidth="2" />
      <path className="auth-summit-trail" d={trail} pathLength="100" fill="none" stroke="#dcf7b9" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M282 40V18 M282 18L295 23L282 28Z" stroke="#dcf7b9" fill="#dcf7b9" strokeWidth="1.4" />
      <circle className="auth-summit-beacon" cx="282" cy="40" r="6" fill="#dcf7b9" fillOpacity=".5" />
    </svg>
  </div>;
}
