# dzz Meteora relaunch posts, in the shape of $TC's Meteora relaunch, framed as dzz moving to Meteora. No pump.fun mentions. Writes meteora-relaunch.txt with counts.
import re, pathlib
P = [
('main', '''We've been building dzz for over a month.

Today we're moving it to Meteora. $dzz moves first, and every new dzz feature gets built there from now on.

Your coin at the address you choose, signed from your own wallet, paired with SOL or any token.

dzzdeploy.vercel.app'''),
('reply: ca', '''$dzz now lives on Meteora. It's the official coin of dzz.

CA: <CA>

Only trust this address.'''),
('why meteora', '''Why Meteora?

Because on Meteora the dev sets the rules, not the launchpad:

- pick your trading fee, 0.5% to 3%
- pick where your coin graduates
- snipers pay a 50% fee in the first 2 minutes
- pair with SOL, HYPE, ZEC, Take-Two or any token'''),
('the numbers', '''Where dzz is coming from:

- 28 accounts
- 63 coins launched at custom addresses
- 10.4 SOL in creator fees claimed by their devs

All of it is on the public leaderboard. Now it's Meteora's turn.

dzzdeploy.vercel.app'''),
('after the launch', '''And after the launch:

- claim creator fees on any coin, from any wallet
- a public fees page: what every coin made and what its dev claimed
- sign in with X, Discord or a wallet: all your launches and fees in one place
- a PnL calendar for every launcher'''),
]
out = []
for k, t in P:
    n = len(re.sub(r'\S+\.vercel\.app', 'x' * 23, t).replace('<CA>', 'x' * 44))
    out.append(f'--- {k} ({n}/280)\n{t}\n'); print(k, n)
pathlib.Path(__file__).with_name('meteora-relaunch.txt').write_text('\n'.join(out), encoding='utf8')
