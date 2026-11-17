# dzz Meteora relaunch posts, in the shape of $TC's Meteora relaunch, framed as dzz moving to Meteora. No pump.fun mentions. Writes meteora-relaunch.txt with counts.
import re, pathlib
P = [
('announce (before launch)', '''A change of plan for $dzz.

Our first venue is no longer the right home for dzz, so we're moving. The official $dzz will launch on @MeteoraAG instead.

Same launcher, same custom addresses, same dev. Only the venue changes.

Launch time and CA will be posted here. Nothing before that is ours.'''),
('go live (with the film)', '''$dzz is live on @MeteoraAG.

This is the official coin of dzz, launched through dzz itself at a custom address.

CA: <CA>

Only trust this address.'''),
('reply: what moved', '''Everything moved with it:

- 63 coins launched at custom addresses
- 10.4 SOL in creator fees claimed by their devs
- pick your fee, your pair and where your coin graduates
- claim fees on any coin, from any wallet

dzzdeploy.vercel.app'''),
]
out = []
for k, t in P:
    n = len(re.sub(r'\S+\.vercel\.app', 'x' * 23, t).replace('<CA>', 'x' * 44))
    out.append(f'--- {k} ({n}/280)\n{t}\n'); print(k, n)
pathlib.Path(__file__).with_name('meteora-relaunch.txt').write_text('\n'.join(out), encoding='utf8')
