# dzz Meteora relaunch posts, in the shape of $TC's Meteora relaunch. No pump.fun mentions. Writes meteora-relaunch.txt with counts.
import re, pathlib
P = [
('main', '''We've been building dzz for over a month.

A launcher that puts your coin at the address you choose, signed from your own wallet, on Meteora and Float, paired with SOL or almost any token.

Today $dzz goes live on Meteora.

dzzdeploy.vercel.app'''),
('reply: ca', '''$dzz is the official coin of dzz.

CA: <CA>

Only trust this address.'''),
('the numbers', '''A glance at dzz so far:

- 28 accounts
- 63 coins launched at custom addresses
- 10.4 SOL in creator fees claimed by their devs

Every launcher, coin and fee is on the public leaderboard.

dzzdeploy.vercel.app'''),
('what it does', '''What is dzz?

- pick any address ending, your browser finds it
- launch on Meteora or Float from your own wallet
- pair with SOL, USDC, HYPE, ZEC, Take-Two or any token
- split fees to a second wallet

$dzz is its official coin.'''),
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
