import { useEffect, useMemo, useState } from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Eye, EyeOff, Fingerprint, LockKeyhole, Plus, RotateCcw, ShieldAlert, Sparkles, Users, Vote, X } from 'lucide-react';
import { countVotes, createRound, guessMatches, type CategoryChoice, type RoleAssignment, type VoteOutcome, WORD_CATEGORIES, type Player } from './game';

type Phase = 'setup' | 'deal' | 'discussion' | 'vote-pass' | 'vote-select' | 'vote-results' | 'guess' | 'result';
type Winner = 'crew' | 'impostor';

const starterNames = ['Mira', 'Theo', 'Nico', 'June'];
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

function Home() {
  const [names, setNames] = useState(starterNames);
  const [impostorCount, setImpostorCount] = useState(1);
  const [category, setCategory] = useState<CategoryChoice>('Random');
  const [minutes, setMinutes] = useState(3);
  const [phase, setPhase] = useState<Phase>('setup');
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [secretWord, setSecretWord] = useState('');
  const [secretCategory, setSecretCategory] = useState('');
  const [dealIndex, setDealIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(180);
  const [timerRunning, setTimerRunning] = useState(true);
  const [voteOrder, setVoteOrder] = useState<string[]>([]);
  const [voteIndex, setVoteIndex] = useState(0);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [voteOutcome, setVoteOutcome] = useState<VoteOutcome | null>(null);
  const [revoteEligible, setRevoteEligible] = useState<string[] | null>(null);
  const [selectedSuspect, setSelectedSuspect] = useState('');
  const [eliminated, setEliminated] = useState<RoleAssignment | null>(null);
  const [guess, setGuess] = useState('');
  const [winner, setWinner] = useState<Winner | null>(null);
  const [resultReason, setResultReason] = useState('');
  const [message, setMessage] = useState('');

  const currentDealing = assignments[dealIndex];
  const currentVoter = assignments.find((player) => player.id === voteOrder[voteIndex]);
  const livingPlayers = useMemo(() => assignments.filter((player) => !player.votedOut), [assignments]);
  const currentCandidates = revoteEligible
    ? livingPlayers.filter((player) => revoteEligible.includes(player.id))
    : livingPlayers;

  useEffect(() => {
    if (phase !== 'discussion' || !timerRunning) return undefined;
    const timer = window.setInterval(() => {
      setSecondsLeft((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, timerRunning, assignments]);

  useEffect(() => {
    if (phase !== 'discussion' || secondsLeft !== 0) return;
    setTimerRunning(false);
    beginVoting(assignments, null);
  }, [phase, secondsLeft, assignments]);

  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => setMessage(''), 2300);
    return () => window.clearTimeout(timeout);
  }, [message]);

  function beginGame(nextNames = names, nextCategory = category, nextImpostors = impostorCount) {
    const cleaned = nextNames.map((name) => name.trim()).filter(Boolean);
    if (cleaned.length < 3 || cleaned.length > 12) {
      setMessage('A round needs 3 to 12 players.');
      return;
    }
    if (new Set(cleaned.map((name) => name.toLocaleLowerCase())).size !== cleaned.length) {
      setMessage('Give everyone a different name so votes stay clear.');
      return;
    }
    const players: Player[] = cleaned.map((name, index) => ({ id: `seat-${index}-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`, name }));
    const round = createRound(players, nextImpostors, nextCategory);
    setAssignments(round.assignments);
    setSecretWord(round.secretWord);
    setSecretCategory(round.category);
    setDealIndex(0);
    setRevealed(false);
    setSecondsLeft(minutes * 60);
    setTimerRunning(true);
    setVotes({});
    setVoteOutcome(null);
    setRevoteEligible(null);
    setWinner(null);
    setEliminated(null);
    setGuess('');
    setPhase('deal');
  }

  function beginVoting(roster = assignments, eligible: string[] | null = revoteEligible) {
    const alive = roster.filter((player) => !player.votedOut).map((player) => player.id);
    setVoteOrder(alive);
    setVoteIndex(0);
    setVotes({});
    setVoteOutcome(null);
    setRevoteEligible(eligible);
    setSelectedSuspect('');
    setPhase('vote-pass');
  }

  function submitVote() {
    if (!currentVoter || !selectedSuspect) return;
    const updated = { ...votes, [currentVoter.id]: selectedSuspect };
    setVotes(updated);
    setSelectedSuspect('');
    if (voteIndex + 1 < voteOrder.length) {
      setVoteIndex((index) => index + 1);
      setPhase('vote-pass');
    } else {
      setVoteOutcome(countVotes(updated));
      setPhase('vote-results');
    }
  }

  function resolveElimination(playerId: string) {
    const votedOut = assignments.find((player) => player.id === playerId);
    if (!votedOut) return;
    const updated = assignments.map((player) => player.id === playerId ? { ...player, votedOut: true } : player);
    setAssignments(updated);
    setEliminated(votedOut);
    setRevoteEligible(null);
    if (votedOut.role === 'impostor') {
      setGuess('');
      setPhase('guess');
    } else {
      setWinner('impostor');
      setResultReason(`${votedOut.name} was innocent. The impostors blend in and take the round.`);
      setPhase('result');
    }
  }

  function newGame() {
    setPhase('setup');
    setAssignments([]);
    setVotes({});
    setVoteOutcome(null);
    setWinner(null);
    setRevoteEligible(null);
    setRevealed(false);
  }

  const goToDiscussion = () => {
    setSecondsLeft(minutes * 60);
    setTimerRunning(true);
    setPhase('discussion');
  };

  const rootContent = phase === 'setup' ? (
    <main className="setup-layout">
      <section className="hero-copy">
        <p className="eyebrow">A pocket-sized game of suspicion</p>
        <h1 className="hero-title">Someone<br />knows <span className="accent-word">nothing.</span></h1>
        <p className="hero-desc">One phone. A circle of friends. One secret word — and someone at the table has no idea what it is.</p>
        <div className="hero-note">
          <span className="hero-note-mark"><Fingerprint size={18} /></span>
          <span>Keep your eyes open.<br />The odd one out is already among you.</span>
        </div>
      </section>

      <section className="config-card" aria-label="Game setup">
        <div className="card-head">
          <div><span className="eyebrow">Before the whispers</span><h2>Set the table</h2></div>
          <span className="step-mark">01 / SETUP</span>
        </div>

        <div className="field-label"><span>Players</span><span data-testid="text-player-count">{names.filter((name) => name.trim()).length} / 12</span></div>
        <div className="player-list">
          {names.map((name, index) => (
            <div className="player-row" key={`name-${index}`}>
              <span className="player-index">{String(index + 1).padStart(2, '0')}</span>
              <input
                className="text-input"
                value={name}
                maxLength={22}
                onChange={(event) => setNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                aria-label={`Player ${index + 1} name`}
                placeholder={`Player ${index + 1}`}
                data-testid={`input-player-${index + 1}`}
              />
              {names.length > 3 && <button className="icon-button" type="button" aria-label={`Remove player ${name || index + 1}`} data-testid={`button-remove-player-${index + 1}`} onClick={() => setNames((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button>}
            </div>
          ))}
        </div>
        <button className="add-player" type="button" onClick={() => setNames((current) => current.length < 12 ? [...current, ''] : current)} disabled={names.length >= 12} data-testid="button-add-player">
          <Plus size={15} /> Add a player
        </button>

        <div className="form-divider" />
        <div className="option-grid">
          <div>
            <div className="field-label"><span>Impostors</span></div>
            <div className="segmented" role="group" aria-label="Number of impostors">
              {[1, 2].map((count) => <button key={count} type="button" className={`segment ${impostorCount === count ? 'active' : ''}`} aria-pressed={impostorCount === count} onClick={() => setImpostorCount(count)} data-testid={`button-impostors-${count}`}>{count}</button>)}
            </div>
          </div>
          <div>
            <div className="field-label"><span>Talk time</span></div>
            <div className="select-wrap">
              <select className="select-input" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} aria-label="Discussion timer in minutes" data-testid="select-discussion-time">
                {[2, 3, 4, 5].map((time) => <option key={time} value={time}>{time} minutes</option>)}
              </select>
              <ChevronDown className="select-chevron" size={15} />
            </div>
          </div>
        </div>
        <div className="field-label"><span>Word category</span></div>
        <div className="select-wrap">
          <select className="select-input" value={category} onChange={(event) => setCategory(event.target.value as CategoryChoice)} aria-label="Word category" data-testid="select-category">
            <option value="Random">Surprise me — random category</option>
            {WORD_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <ChevronDown className="select-chevron" size={15} />
        </div>
        <button className="start-button" type="button" onClick={() => beginGame()} data-testid="button-start-game">
          Deal the secrets <ArrowRight size={17} />
        </button>
        <div className="card-foot"><LockKeyhole size={12} /> Everything stays on this phone</div>
      </section>
    </main>
  ) : (
    <main className="game-page">
      <div className="game-header">
        <div className="phase-tag"><span className="phase-number">{phase === 'deal' ? '02' : phase === 'discussion' ? '03' : ['vote-pass', 'vote-select', 'vote-results'].includes(phase) ? '04' : phase === 'guess' ? '05' : '06'}</span>{phase === 'deal' ? 'Private dealing' : phase === 'discussion' ? 'Open discussion' : ['vote-pass', 'vote-select', 'vote-results'].includes(phase) ? 'The vote' : phase === 'guess' ? 'Final chance' : 'Round over'}</div>
        <button className="reset-button" type="button" onClick={newGame} data-testid="button-new-game"><RotateCcw size={14} /> New game</button>
      </div>

      {phase === 'deal' && currentDealing && (
        <>
          <p className="eyebrow">The secret is making its way around</p>
          <h1 className="phase-title">Pass it carefully.</h1>
          <p className="phase-subtitle">Only the named player should look. Everyone else: eyes away.</p>
          {!revealed ? (
            <section className="handoff-card" data-testid="status-private-handoff">
              <span className="handoff-kicker">Hand the phone to</span>
              <h2 className="handoff-name">{currentDealing.name}</h2>
              <p className="handoff-guidance">Make sure nobody can peek over your shoulder. Your secret stays yours.</p>
              <div className="privacy-rule"><EyeOff size={15} /> The screen is safe to pass</div>
              <button className="action-button" type="button" onClick={() => setRevealed(true)} data-testid="button-reveal-role">I'm {currentDealing.name} — show my card <Eye size={16} /></button>
            </section>
          ) : (
            <section className="handoff-card reveal-card" data-testid="status-private-role">
              <span className="role-stamp">{currentDealing.role === 'impostor' ? 'You are the impostor' : 'You are with the crew'}</span>
              {currentDealing.role === 'crew' ? <>
                <h2 className="secret-word" data-testid="text-secret-word">{secretWord}</h2>
                <span className="secret-category" data-testid="text-secret-category">Category: {secretCategory}</span>
              </> : <>
                <span className="impostor-mark"><ShieldAlert size={31} /></span>
                <h2 className="impostor-secret">No word for you.</h2>
                <span className="secret-category">Category: {secretCategory}</span>
                <p className="handoff-guidance" style={{ marginTop: 16 }}>Listen closely. Say just enough to belong.</p>
              </>}
              <button className="action-button" type="button" onClick={() => {
                setRevealed(false);
                if (dealIndex + 1 < assignments.length) setDealIndex((index) => index + 1);
                else goToDiscussion();
              }} data-testid="button-conceal-and-continue">
                <EyeOff size={16} /> Conceal &amp; pass to {dealIndex + 1 < assignments.length ? assignments[dealIndex + 1].name : 'the table'}
              </button>
            </section>
          )}
          <p className="footer-line" data-testid="text-deal-progress">PLAYER {String(dealIndex + 1).padStart(2, '0')} OF {String(assignments.length).padStart(2, '0')}</p>
        </>
      )}

      {phase === 'discussion' && (
        <>
          <p className="eyebrow">Every word could give you away</p>
          <h1 className="phase-title">Talk. Listen. Doubt.</h1>
          <p className="phase-subtitle">Describe the secret without saying it. Find the person faking their way through.</p>
          <section className="discussion-panel" data-testid="panel-discussion">
            <div className="timer-display">
              <span className="timer-label">{secondsLeft === 0 ? 'Time is up' : timerRunning ? 'Time left to accuse' : 'Discussion paused'}</span>
              <div className={`timer-value ${secondsLeft < 30 ? 'urgent' : ''}`} data-testid="text-discussion-timer">{formatTime(secondsLeft)}</div>
              <div className="timer-track"><div className="timer-progress" style={{ width: `${Math.max(0, secondsLeft / (minutes * 60) * 100)}%` }} /></div>
            </div>
            <p className="discussion-prompt"><Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} /> Give a clue that's specific enough to prove you know the word, but vague enough to stay safe.</p>
            <button className="action-button" type="button" onClick={() => { setTimerRunning(false); beginVoting(assignments, null); }} data-testid="button-start-voting">Time to vote <Vote size={17} /></button>
            <button className="button-secondary" type="button" onClick={() => setTimerRunning((running) => !running)} data-testid="button-toggle-timer">{timerRunning ? 'Pause timer' : 'Resume timer'} <Clock3 size={15} /></button>
          </section>
          <p className="footer-line">NO PHONES, NO NOTES. JUST GOOD BLUFFS.</p>
        </>
      )}

      {phase === 'vote-pass' && currentVoter && (
        <>
          <p className="eyebrow">Keep every choice private</p>
          <h1 className="phase-title">One vote each.</h1>
          <p className="phase-subtitle">Pass the phone. No one sees the votes until the whole table has chosen.</p>
          <section className="handoff-card pass-vote-card" data-testid="status-vote-handoff">
            <span className="handoff-kicker">Your turn to choose</span>
            <h2 className="handoff-name">{currentVoter.name}</h2>
            <p className="handoff-guidance">Take the phone, keep your choice to yourself, then name the player you suspect.</p>
            <div className="vote-count">VOTER {voteIndex + 1} OF {voteOrder.length}</div>
            <button className="action-button" type="button" onClick={() => setPhase('vote-select')} data-testid="button-open-ballot">Cast a private vote <ArrowRight size={16} /></button>
          </section>
          <p className="footer-line"><LockKeyhole size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Ballots stay hidden until everyone has voted</p>
        </>
      )}

      {phase === 'vote-select' && currentVoter && (
        <>
          <p className="eyebrow">Only {currentVoter.name} should see this</p>
          <h1 className="phase-title">Who feels off?</h1>
          <p className="phase-subtitle">Choose one person. Your selection is private until the reveal.</p>
          <section className="vote-panel" data-testid="panel-private-ballot">
            <span className="field-label">Your suspect</span>
            <div className="player-pick-list">
              {currentCandidates.filter((player) => player.id !== currentVoter.id || currentCandidates.length === 1).map((player) => (
                <button key={player.id} type="button" className={`player-pick ${selectedSuspect === player.id ? 'selected' : ''}`} onClick={() => setSelectedSuspect(player.id)} aria-pressed={selectedSuspect === player.id} data-testid={`button-vote-for-${player.id}`}>
                  <span className="pick-avatar">{initials(player.name)}</span><span className="pick-name">{player.name}</span>{selectedSuspect === player.id && <Check className="pick-check" size={18} />}
                </button>
              ))}
            </div>
            <button className="action-button" type="button" onClick={submitVote} disabled={!selectedSuspect} data-testid="button-submit-vote">{voteIndex + 1 === voteOrder.length ? 'Lock in final vote' : 'Lock vote & pass phone'} <ArrowRight size={16} /></button>
            <button className="button-secondary" type="button" onClick={() => setPhase('vote-pass')} data-testid="button-back-to-vote-pass"><ArrowLeft size={14} /> Back</button>
          </section>
          <p className="footer-line"><EyeOff size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Hide your selection before handing over</p>
        </>
      )}

      {phase === 'vote-results' && voteOutcome && (
        <>
          <p className="eyebrow">The table has spoken</p>
          <h1 className="phase-title">{voteOutcome.leaders.length > 1 ? 'Dead even.' : 'The votes are in.'}</h1>
          <p className="phase-subtitle">{voteOutcome.leaders.length > 1 ? 'No one leaves on a tie. The tied players are the only suspects in the revote.' : 'Here is how the suspicion landed.'}</p>
          <section className="vote-panel" data-testid="panel-vote-results">
            <span className="field-label"><span>Vote tally</span><span data-testid="text-vote-total">{Object.keys(votes).length} votes</span></span>
            <div className="vote-columns">
              {livingPlayers.map((player) => {
                const count = voteOutcome.counts[player.id] ?? 0;
                const leader = voteOutcome.leaders.includes(player.id);
                return <div className="vote-result-row" key={player.id} data-testid={`row-vote-result-${player.id}`}><span>{player.name}</span><span className="vote-bar-track"><span className={`vote-bar-fill ${leader ? 'leading' : ''}`} style={{ display: 'block', width: `${Object.keys(votes).length ? count / Object.keys(votes).length * 100 : 0}%`, height: '100%' }} /></span><span className="vote-total">{count}</span></div>;
              })}
            </div>
            {voteOutcome.leaders.length > 1 ? (
              <>
                <div className="tie-banner" data-testid="status-vote-tie">A tie between {voteOutcome.leaders.map((id) => assignments.find((player) => player.id === id)?.name).join(' and ')}. These players go into a revote.</div>
                <button className="action-button" type="button" onClick={() => beginVoting(assignments, voteOutcome.leaders)} data-testid="button-start-revote">Revote between tied players <RotateCcw size={16} /></button>
              </>
            ) : (
              <button className="action-button" type="button" onClick={() => resolveElimination(voteOutcome.leaders[0])} data-testid="button-reveal-voted-player">Reveal who was voted out <ArrowRight size={16} /></button>
            )}
          </section>
          <p className="footer-line">THE ROOM IS QUIET FOR A REASON.</p>
        </>
      )}

      {phase === 'guess' && eliminated && (
        <>
          <p className="eyebrow">The impostor has one last move</p>
          <h1 className="phase-title">Name the secret.</h1>
          <p className="phase-subtitle">{eliminated.name} was an impostor. Guess the word exactly to steal the win from the crew.</p>
          <section className="result-panel" data-testid="panel-impostor-guess">
            <div className="outcome-icon impostor"><ShieldAlert size={27} /></div>
            <span className="role-stamp" style={{ background: '#e7ddcf', border: 'none', color: '#8a4d37' }}>Final guess</span>
            <p className="result-copy">The category was <strong>{secretCategory}</strong>. Enter the secret word — one chance only.</p>
            <input className="text-input guess-input" value={guess} onChange={(event) => setGuess(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && guess.trim()) { const matched = guessMatches(guess, secretWord); setWinner(matched ? 'impostor' : 'crew'); setResultReason(matched ? 'The impostor guessed the secret word. The crew was outplayed.' : 'The guess was wrong. The crew kept its secret and wins.'); setPhase('result'); } }} placeholder="Enter one word or phrase" aria-label="Impostor's secret word guess" data-testid="input-impostor-guess" />
            <button className="action-button" type="button" disabled={!guess.trim()} onClick={() => { const matched = guessMatches(guess, secretWord); setWinner(matched ? 'impostor' : 'crew'); setResultReason(matched ? 'The impostor guessed the secret word. The crew was outplayed.' : 'The guess was wrong. The crew kept its secret and wins.'); setPhase('result'); }} data-testid="button-submit-guess">Make the final guess <ArrowRight size={16} /></button>
          </section>
          <p className="footer-line"><LockKeyhole size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Keep the word hidden from the crew</p>
        </>
      )}

      {phase === 'result' && winner && (
        <>
          <p className="eyebrow">The secret is safe to share now</p>
          <h1 className="phase-title">Game over.</h1>
          <p className="phase-subtitle">The bluff has been called. Reveal the secret and see who had it all along.</p>
          <section className="result-panel" data-testid="panel-game-result">
            <div className={`outcome-icon ${winner === 'impostor' ? 'impostor' : ''}`}>{winner === 'impostor' ? <ShieldAlert size={27} /> : <Users size={27} />}</div>
            <span className="eyebrow" data-testid="status-winning-side">{winner === 'impostor' ? 'Impostors win' : 'The crew wins'}</span>
            <h2 className="result-title">{winner === 'impostor' ? 'A convincing lie.' : 'Truth finds a way.'}</h2>
            <p className="result-copy" data-testid="text-result-reason">{resultReason}</p>
            <div className="word-reveal" data-testid="text-final-secret"><span>The secret word</span><strong>{secretWord}</strong></div>
            <div className="word-reveal" style={{ marginTop: 9 }} data-testid="text-final-impostors"><span>Impostor{assignments.filter((player) => player.role === 'impostor').length > 1 ? 's' : ''}</span><strong>{assignments.filter((player) => player.role === 'impostor').map((player) => player.name).join(' & ')}</strong></div>
            <button className="action-button" type="button" onClick={() => beginGame()} data-testid="button-play-again"><RotateCcw size={16} /> Play again with same setup</button>
            <button className="button-secondary" type="button" onClick={newGame} data-testid="button-return-to-setup"><ArrowLeft size={15} /> Change players or settings</button>
          </section>
          <p className="footer-line">ANOTHER ROUND? THE TABLE IS READY.</p>
        </>
      )}
    </main>
  );

  return (
    <div className="game-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Word Impostor home" data-testid="link-home">
          <span className="brand-mark"><Fingerprint size={20} /></span>
          <span className="brand-name">word <span>impostor</span></span>
        </a>
        <span className="top-caption"><span className="live-dot" /> Pass the phone. Trust no one.</span>
      </header>
      {rootContent}
      {message && <div className="toast-msg" role="status" data-testid="status-toast">{message}</div>}
    </div>
  );
}

function Router() {
  return <Switch><Route path="/" component={Home} /><Route><Home /></Route></Switch>;
}

function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>;
}

export default App;
