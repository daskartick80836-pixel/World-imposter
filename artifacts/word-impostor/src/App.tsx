import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowRight, Check, Clipboard, Eye, EyeOff, Fingerprint, LockKeyhole, LogOut, MessageCircle, Plus, RefreshCw, Shield, ShieldAlert, Sparkles, Users, Vote, Wifi, X } from "lucide-react";
import { CategoryId, LanguageCode, getGetGameConfigQueryKey, useGetGameConfig } from "@workspace/api-client-react";
import type { Ack, RoomJoinResult } from "@workspace/api-zod";
import { getGameSocket } from "./socket";
import type { ClueView, GameOverPayload, GameRoomView, PrivateRolePayload, RevealedPlayerPayload, RoomPlayerView, VoteOutcomePayload } from "./socket-contract";

type PersistedSession = { roomCode: string; playerName: string; resumeToken: string };
const SESSION_KEY = "word-impostor-session";
const languageNames: Record<LanguageCode, string> = { en: "English", bn: "বাংলা", hi: "हिन्दी", es: "Español", fr: "Français" };

function readSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    return parsed.roomCode && parsed.playerName && parsed.resumeToken ? parsed : null;
  } catch {
    return null;
  }
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
const categoryFallback: Record<string, string> = { vehicles: "Vehicles", household: "Around the house", electronics: "Electronics", animals: "Animals", school: "School", food: "Food & drink" };

function App() {
  const socket = useMemo(() => getGameSocket(), []);
  const [language, setLanguage] = useState<LanguageCode>("en");
  const configQuery = useGetGameConfig({ language }, { query: { queryKey: getGetGameConfigQueryKey({ language }) } });
  const [room, setRoom] = useState<GameRoomView | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [role, setRole] = useState<PrivateRolePayload | null>(null);
  const [revealedPlayer, setRevealedPlayer] = useState<RevealedPlayerPayload | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [voteOutcome, setVoteOutcome] = useState<VoteOutcomePayload | null>(null);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [category, setCategory] = useState<CategoryId>("food");
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");
  const [selectedVote, setSelectedVote] = useState("");
  const [secretVisible, setSecretVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const resuming = useRef(false);
  const roomRef = useRef<GameRoomView | null>(null);

  const updateRoom = useCallback((next: GameRoomView) => {
    if (roomRef.current && roomRef.current.round !== next.round) {
      setRole(null);
      setRevealedPlayer(null);
      setGameOver(null);
      setVoteOutcome(null);
      setClue("");
      setGuess("");
      setSecretVisible(false);
    }
    roomRef.current = next;
    setRoom(next);
    setLanguage(next.language);
  }, []);

  useEffect(() => {
    const saved = readSession();
    if (saved) {
      setPlayerName(saved.playerName);
      setRoomCodeInput(saved.roomCode);
    }
    const resume = () => {
      setOnline(true);
      const session = readSession();
      if (!session || resuming.current) return;
      resuming.current = true;
      socket.emit("resumeRoom", { roomCode: session.roomCode, resumeToken: session.resumeToken }, (response) => {
        resuming.current = false;
        if (response.ok) {
          setPlayerId(response.data.playerId);
          updateRoom(response.data.room);
          setError("");
        } else {
          sessionStorage.removeItem(SESSION_KEY);
          setRoom(null);
          roomRef.current = null;
          setError(`Could not resume that room: ${response.error}`);
        }
      });
    };
    const onDisconnect = () => setOnline(false);
    const onRoom = (next: GameRoomView) => updateRoom(next);
    const onRole = (payload: PrivateRolePayload) => { setRole(payload); setSecretVisible(false); };
    const onPlayerRevealed = (payload: RevealedPlayerPayload) => setRevealedPlayer(payload);
    const onClue = (item: ClueView) => setRoom((current) => current ? { ...current, clues: [...current.clues.filter((entry) => entry.playerId !== item.playerId), item] } : current);
    const onOutcome = (outcome: VoteOutcomePayload) => setVoteOutcome(outcome);
    const onGameOver = (result: GameOverPayload) => { setGameOver(result); setSelectedVote(""); };
    const onError = (message: string) => { setBusy(false); setError(message); };
    socket.on("connect", resume);
    socket.on("disconnect", onDisconnect);
    socket.on("roomState", onRoom);
    socket.on("privateRole", onRole);
    socket.on("playerRevealed", onPlayerRevealed);
    socket.on("clueAdded", onClue);
    socket.on("voteOutcome", onOutcome);
    socket.on("gameOver", onGameOver);
    socket.on("errorMsg", onError);
    socket.connect();
    return () => {
      socket.off("connect", resume);
      socket.off("disconnect", onDisconnect);
      socket.off("roomState", onRoom);
      socket.off("privateRole", onRole);
      socket.off("playerRevealed", onPlayerRevealed);
      socket.off("clueAdded", onClue);
      socket.off("voteOutcome", onOutcome);
      socket.off("gameOver", onGameOver);
      socket.off("errorMsg", onError);
    };
  }, [socket, updateRoom]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(""), 4500);
    return () => window.clearTimeout(timer);
  }, [error]);

  const self = room?.players.find((person) => person.id === playerId);
  const host = Boolean(self?.isHost);
  const canStartGame = Boolean(
    room &&
    room.players.filter((person) => person.connected || person.isBot).length >= 3 &&
    room.players.filter((person) => person.connected && !person.isBot).length >= 2
  );
  const categories = configQuery.data?.categories ?? [];
  const languageOptions = configQuery.data?.languages ?? Object.entries(languageNames).map(([code, label]) => ({ code: code as LanguageCode, label }));
  const phaseLabel: Record<string, string> = { LOBBY: "Room lobby", CLUES: "Clue round", VOTING: "Private vote", TIEBREAKER: "Tiebreaker", GUESS: "Last chance", RESULTS: "Round reveal" };

  function fail(message: string) {
    setError(message);
    setBusy(false);
  }

  function perform<T>(send: (ack: (response: Ack<T>) => void) => void, success?: (data: T) => void) {
    if (!online) { fail("Connection lost. Reconnecting now."); return; }
    setBusy(true);
    setError("");
    send((response) => {
      setBusy(false);
      if (!response.ok) fail(response.error);
      else success?.(response.data);
    });
  }

  function saveJoin(result: RoomJoinResult, name: string) {
    setPlayerId(result.playerId);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: result.room.code, playerName: name.trim(), resumeToken: result.resumeToken }));
    setPlayerName(name.trim());
    setRoomCodeInput(result.room.code);
    updateRoom(result.room);
    setError("");
  }

  function createRoom() {
    if (!playerName.trim()) { fail("Add your name before opening a room."); return; }
    sessionStorage.removeItem(SESSION_KEY);
    roomRef.current = null;
    setRoom(null);
    setRole(null);
    perform<RoomJoinResult>((ack) => socket.emit("createRoom", { playerName: playerName.trim(), language, category }, ack), (result) => saveJoin(result, playerName));
  }

  function joinRoom() {
    const code = roomCodeInput.trim().toUpperCase();
    if (!playerName.trim()) { fail("Add your name before joining."); return; }
    if (!/^[A-Z0-9]{5}$/.test(code)) { fail("Room codes are five letters or numbers."); return; }
    perform<RoomJoinResult>((ack) => socket.emit("joinRoom", { roomCode: code, playerName: playerName.trim() }, ack), (result) => saveJoin(result, playerName));
  }

  function roomAction(event: "addBot" | "startGame" | "startVoting" | "nextRound") {
    if (!room) return;
    const input = { roomCode: room.code };
    if (event === "addBot") perform((ack) => socket.emit("addBot", input, ack), updateRoom);
    if (event === "startGame") perform((ack) => socket.emit("startGame", input, ack), updateRoom);
    if (event === "startVoting") perform((ack) => socket.emit("startVoting", input, ack), updateRoom);
    if (event === "nextRound") perform((ack) => socket.emit("nextRound", input, ack), updateRoom);
  }

  function leaveRoom() {
    if (!room) return;
    const code = room.code;
    setBusy(true);
    socket.emit("leaveRoom", { roomCode: code }, (response) => {
      setBusy(false);
      if (!response.ok) { fail(response.error); return; }
      sessionStorage.removeItem(SESSION_KEY);
      roomRef.current = null;
      setRoom(null);
      setPlayerId("");
      setRole(null);
      setGameOver(null);
      setVoteOutcome(null);
      setError("");
    });
  }

  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(`Room code: ${room.code}`);
    }
  }

  function submitClue() {
    if (!room || clue.trim().length < 1) return;
    perform((ack) => socket.emit("submitClue", { roomCode: room.code, clue: clue.trim() }, ack), () => setClue(""));
  }

  function submitVote() {
    if (!room || !selectedVote) return;
    perform<GameRoomView>((ack) => socket.emit("submitVote", { roomCode: room.code, targetId: selectedVote }, ack), (updated) => {
      updateRoom(updated);
      setSelectedVote("");
    });
  }

  function submitGuess() {
    if (!room || guess.trim().length < 1) return;
    perform<GameRoomView>((ack) => socket.emit("submitGuess", { roomCode: room.code, word: guess.trim() }, ack), (updated) => {
      updateRoom(updated);
      setGuess("");
    });
  }

  function removePlayer(person: RoomPlayerView) {
    if (!room || !window.confirm(`Remove ${person.name} from this room?`)) return;
    perform((ack) => socket.emit("removePlayer", { roomCode: room.code, playerId: person.id }, ack), updateRoom);
  }

  const configLabel = (categoryId: string) => categories.find((option) => option.id === categoryId)?.label ?? categoryFallback[categoryId] ?? categoryId;
  const languageLabel = room ? languageNames[room.language] : (languageOptions.find((option) => option.code === language)?.label ?? "English");

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" data-testid="link-home" aria-label="Word Impostor home">
          <span className="brand-mark"><Fingerprint size={20} strokeWidth={1.8} /></span>
          <span className="brand-word">word <b>impostor</b></span>
        </a>
        <div className="connection" data-testid="status-connection"><span className={`connection-dot ${online ? "online" : ""}`} />{online ? "Room line secure" : "Reconnecting"}</div>
      </header>

      {!room ? (
        <main className="landing">
          <section className="intro">
            <div className="overline"><span className="overline-rule" /> A live game for your group chat</div>
            <h1>One word.<br />One <em>impostor.</em></h1>
            <p className="intro-copy">Everyone gets the same secret, except one of you. Trade clues, read the room, and find the person bluffing.</p>
            <div className="table-note"><span className="note-icon"><Shield size={16} /></span><span>Private roles. Public suspicions.<br /><strong>Keep your screen to yourself.</strong></span></div>
            <div className="landing-stat"><span>01 — MAKE A ROOM</span><span>02 — GIVE A CLUE</span><span>03 — FIND THE LIAR</span></div>
          </section>
          <section className="setup-card" aria-label="Create or join a room">
            <div className="card-topline"><span className="eyebrow">Your table is waiting</span><span className="room-status"><span className={`connection-dot ${online ? "online" : ""}`} />{online ? "LIVE" : "CONNECTING"}</span></div>
            <h2>Pull up a seat.</h2>
            <label className="field-label" htmlFor="player-name">Your name</label>
            <input id="player-name" className="text-input" value={playerName} maxLength={22} onChange={(event) => setPlayerName(event.target.value)} placeholder="What should we call you?" data-testid="input-player-name" />
            <div className="setup-options">
              <div>
                <label className="field-label" htmlFor="language-choice">Language</label>
                <div className="select-shell"><select id="language-choice" value={language} onChange={(event) => setLanguage(event.target.value as LanguageCode)} data-testid="select-language">{languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select><ArrowDownRight size={15} /></div>
              </div>
              <div>
                <label className="field-label" htmlFor="category-choice">Word deck</label>
                <div className="select-shell"><select id="category-choice" value={category} onChange={(event) => setCategory(event.target.value as CategoryId)} disabled={configQuery.isLoading || categories.length === 0} data-testid="select-category">
                  {categories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  {!categories.length && <option value="food">{configQuery.isError ? "Default deck" : "Loading decks…"}</option>}
                </select><ArrowDownRight size={15} /></div>
              </div>
            </div>
            {configQuery.isError && <div className="inline-notice" data-testid="status-config-error"><span>Language decks could not load.</span><button type="button" onClick={() => configQuery.refetch()} data-testid="button-retry-config">Retry</button></div>}
            <button className="primary-button" type="button" onClick={createRoom} disabled={!online || busy} data-testid="button-create-room">{busy ? "Opening room…" : "Create a room"}<ArrowRight size={17} /></button>
            <div className="join-divider"><span />or join a room<span /></div>
            <div className="join-row">
              <input className="text-input code-entry" value={roomCodeInput} maxLength={5} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="ROOM CODE" aria-label="Room code" data-testid="input-room-code" />
              <button className="join-button" type="button" onClick={joinRoom} disabled={!online || busy} aria-label="Join room" data-testid="button-join-room"><ArrowRight size={18} /></button>
            </div>
            <p className="card-foot"><LockKeyhole size={12} /> Up to 10 players · each on their own phone</p>
          </section>
          {configQuery.isLoading && <div className="sr-status" role="status" data-testid="status-config-loading">Loading language decks…</div>}
        </main>
      ) : (
        <main className="room-shell">
          <div className="room-bar">
            <div className="phase-chip" data-testid="status-phase"><span className="phase-marker" />{phaseLabel[room.phase] ?? "Game night"}<span className="bar-separator">/</span>Round {room.round || 1}</div>
            <button className="quiet-button" type="button" onClick={leaveRoom} disabled={busy} data-testid="button-leave-room"><LogOut size={14} /> Leave</button>
          </div>

          {room.phase === "LOBBY" && (
            <section className="lobby-layout">
              <div className="lobby-main">
                <div className="eyebrow">A private table · {languageLabel}</div>
                <h1 className="page-title">The room<br /><em>is yours.</em></h1>
                <p className="lede">Bring everyone in before the first secret is dealt.</p>
                <div className="invite-panel">
                  <div><span className="eyebrow">Share this room code</span><div className="room-code" data-testid="text-room-code">{room.code.split("").join(" ")}</div></div>
                  <button className="copy-button" type="button" onClick={copyCode} data-testid="button-copy-room-code"><Clipboard size={15} />{copied ? "Copied" : "Copy code"}</button>
                </div>
                <div className="lobby-actions">
                  {host && <button className="primary-button" type="button" onClick={() => roomAction("startGame")} disabled={busy || !canStartGame} data-testid="button-start-game">Deal the secret<ArrowRight size={17} /></button>}
                  {host && <button className="secondary-button" type="button" onClick={() => roomAction("addBot")} disabled={busy || room.players.length >= 10} data-testid="button-add-bot"><Plus size={16} /> Add a bot</button>}
                </div>
                {!host && <div className="waiting-status" data-testid="status-waiting-host"><span className="pulse-mark" /> Waiting for {room.players.find((person) => person.isHost)?.name ?? "the host"} to start.</div>}
                {host && !canStartGame && <p className="hint" data-testid="status-min-players">At least 3 active players, including 2 people, are needed. Add a bot or share the code.</p>}
                <p className="lobby-footnote"><Wifi size={13} /> Scores carry across rematches in this room.</p>
              </div>
              <aside className="roster-panel">
                <div className="roster-head"><div><span className="eyebrow">The guest list</span><h2>Players <span>{room.players.length}/10</span></h2></div><Users size={18} /></div>
                <div className="roster-list">
                  {room.players.map((person, index) => <PlayerRow key={person.id} person={person} index={index} host={host} onRemove={removePlayer} lobby />)}
                  {room.players.length === 0 && <div className="empty-state" data-testid="status-empty-roster">The room is quiet. Share the code to bring people in.</div>}
                </div>
                <div className="roster-foot"><span className="online-legend" /> Connected players only. Roles stay secret.</div>
              </aside>
            </section>
          )}

          {room.phase === "CLUES" && (
            <section className="play-layout">
              <div className="play-intro"><div className="eyebrow">Round {room.round} · {configLabel(room.category)}</div><h1 className="page-title">Say just<br /><em>enough.</em></h1><p className="lede">One clue each. Make it clear you know the word, but never say it out loud.</p>
                <PrivateCard role={role} visible={secretVisible} onToggle={() => setSecretVisible((shown) => !shown)} categoryLabel={configLabel(role?.category ?? room.category)} />
              </div>
              <section className="play-panel">
                <div className="progress-row"><span className="eyebrow">Clues at the table</span><span className="progress-count" data-testid="text-clue-progress">{room.clueCount}/{room.voterCount}</span></div>
                <div className="progress-track"><span style={{ width: `${room.voterCount ? Math.min(100, room.clueCount / room.voterCount * 100) : 0}%` }} /></div>
                {room.clues.length > 0 ? <div className="clue-list" data-testid="list-public-clues">{room.clues.map((item, index) => <article className="clue-item" key={`${item.playerId}-${index}`} data-testid={`card-clue-${item.playerId}`}><span className="clue-initial">{initials(item.playerName)}</span><div><strong>{item.playerName}</strong><p>{item.clue}</p></div><MessageCircle size={15} /></article>)}</div> : <div className="empty-clues" data-testid="status-no-clues"><Sparkles size={16} /> The first clue is still waiting.</div>}
                {!self?.hasClue ? <div className="submit-clue">
                  <label className="field-label" htmlFor="clue-text">Your clue <span>120 characters max</span></label>
                  <textarea id="clue-text" maxLength={120} value={clue} onChange={(event) => setClue(event.target.value)} placeholder="Give them something to go on…" data-testid="input-clue" />
                  <div className="field-bottom"><span data-testid="text-clue-length">{clue.length}/120</span><button className="primary-button compact" type="button" onClick={submitClue} disabled={busy || !clue.trim()} data-testid="button-submit-clue">Send clue<ArrowRight size={15} /></button></div>
                </div> : <div className="submitted-status" data-testid="status-clue-submitted"><Check size={15} /> Your clue is in. Stay sharp.</div>}
                {host && <button className="secondary-button full-button" type="button" onClick={() => roomAction("startVoting")} disabled={busy || room.clueCount < room.voterCount} data-testid="button-start-voting"><Vote size={15} /> Open the vote</button>}
                {!host && <div className="waiting-status compact-wait" data-testid="status-waiting-clues"><span className="pulse-mark" /> {room.clueCount < room.voterCount ? "Waiting for every clue." : "All clues are in. Host will open voting."}</div>}
              </section>
            </section>
          )}

          {(room.phase === "VOTING" || room.phase === "TIEBREAKER") && (
            <section className="vote-layout">
              <div className="vote-heading"><div className="eyebrow">{room.phase === "TIEBREAKER" ? "The room couldn't decide" : "Clues are done. Trust your read."}</div><h1 className="page-title">{room.phase === "TIEBREAKER" ? <>A closer<br /><em>call.</em></> : <>Who is<br /><em>bluffing?</em></>}</h1><p className="lede">Choose in private. Your ballot stays hidden until the room resolves it.</p>
                <div className="vote-progress-card"><span className="eyebrow">Ballots received</span><strong data-testid="text-vote-progress">{room.voteCount}<i> / </i>{room.voterCount}</strong><div className="progress-track"><span style={{ width: `${room.voterCount ? Math.min(100, room.voteCount / room.voterCount * 100) : 0}%` }} /></div></div>
                {voteOutcome && <div className="tie-notice" data-testid="status-tiebreaker">{voteOutcome.tie ? "A tie. Only the leading names remain on the ballot." : "The vote is being resolved."}</div>}
              </div>
              <section className="vote-panel">
                <div className="roster-head"><div><span className="eyebrow">{room.phase === "TIEBREAKER" ? "Tied suspects only" : "Choose one player"}</span><h2>Your ballot</h2></div><LockKeyhole size={17} /></div>
                {self?.hasVoted ? <div className="ballot-wait" data-testid="status-vote-submitted"><span className="sealed-mark"><Check size={18} /></span><h3>Vote sealed.</h3><p>Your choice is hidden. Wait for the rest of the room.</p></div> : (
                  <>
                    <div className="suspect-list">
                       {room.players.filter((person) => person.id !== playerId && room.voteCandidates.includes(person.id)).map((person) => <button type="button" key={person.id} className={`suspect-option ${selectedVote === person.id ? "chosen" : ""}`} onClick={() => setSelectedVote(person.id)} aria-pressed={selectedVote === person.id} data-testid={`button-vote-player-${person.id}`}><span className="avatar">{initials(person.name)}</span><span className="suspect-name">{person.name}</span><span className="suspect-score">{person.score} pts</span>{selectedVote === person.id && <Check size={17} />}</button>)}
                    </div>
                    {!room.voteCandidates.length && <div className="empty-state" data-testid="status-no-vote-candidates">Waiting for the host to open ballots.</div>}
                    <button className="primary-button" type="button" onClick={submitVote} disabled={!selectedVote || busy} data-testid="button-submit-vote">Seal my vote<Vote size={16} /></button>
                  </>
                )}
                {room.clues.length > 0 && <details className="clue-reference"><summary data-testid="button-review-clues">Review the clues <span>{room.clues.length}</span></summary><div>{room.clues.map((item) => <p key={item.playerId}><b>{item.playerName}</b> — {item.clue}</p>)}</div></details>}
              </section>
            </section>
          )}

          {room.phase === "GUESS" && (
            <section className="centered-game">
              <div className="eyebrow">The vote has named someone</div><h1 className="page-title">One last<br /><em>word.</em></h1>
              <div className="final-panel">
                <div className="final-icon"><ShieldAlert size={22} /></div>
                {revealedPlayer && <div className="reveal-person" data-testid="status-voted-out-role"><span>Voted out</span><strong>{room.players.find((person) => person.id === revealedPlayer.playerId)?.name ?? "A player"} was the impostor.</strong></div>}
                {role?.role === "IMPOSTOR" ? <>
                  <span className="eyebrow">Impostor's final chance</span><h2>Can you name the secret?</h2><p>The crew has found you. Get the word right to take the round.</p>
                  <label className="field-label" htmlFor="impostor-guess">Your guess</label><input id="impostor-guess" className="text-input" value={guess} maxLength={80} onChange={(event) => setGuess(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitGuess(); }} placeholder="Enter the secret word…" data-testid="input-impostor-guess" />
                  <button className="primary-button" type="button" onClick={submitGuess} disabled={!guess.trim() || busy} data-testid="button-submit-guess">Make the guess<ArrowRight size={16} /></button>
                </> : <><span className="eyebrow">The final answer is in</span><h2>The impostor gets one guess.</h2><p>Keep the secret to yourself. The round will resolve as soon as their answer lands.</p><div className="waiting-status" data-testid="status-waiting-guess"><span className="pulse-mark" /> Waiting for the impostor's answer.</div></>}
              </div>
            </section>
          )}

          {room.phase === "RESULTS" && (
            <section className="results-layout">
              <div className="eyebrow">Round {room.round} · the secret is out</div>
              <h1 className="page-title">{room.winner === "CREW" ? <>The crew<br /><em>read the room.</em></> : <>A perfect<br /><em>bluff.</em></>}</h1>
              <div className="result-card">
                <div className={`result-symbol ${room.winner === "IMPOSTOR" ? "danger" : ""}`}>{room.winner === "IMPOSTOR" ? <ShieldAlert size={22} /> : <Users size={22} />}</div>
                <span className="eyebrow" data-testid="status-round-winner">{room.winner === "CREW" ? "Crew wins" : "Impostor wins"}</span>
                <h2>{gameOver?.reason === "CORRECT_GUESS" ? "The word was stolen." : gameOver?.reason === "INNOCENT_ELIMINATED" ? "An innocent went out." : gameOver?.reason === "WRONG_GUESS" ? "The secret held." : "The table has decided."}</h2>
                <div className="secret-reveal"><span>Secret word</span><strong data-testid="text-secret-word">{gameOver?.secretWord ?? "Revealed after the round"}</strong></div>
                <div className="reveal-person"><span>Impostor</span><strong data-testid="text-impostor-name">{gameOver ? room.players.find((person) => person.id === gameOver.impostorId)?.name ?? "Player left" : "Revealing…"}</strong></div>
                <div className="scoreboard"><div className="scoreboard-title"><span>Room scores</span><span>PTS</span></div>{[...room.players].sort((a, b) => b.score - a.score).map((person) => <div className="score-line" key={person.id} data-testid={`row-score-${person.id}`}><span>{person.name}{person.isHost && <i>HOST</i>}</span><b>{person.score}</b></div>)}</div>
                {host && <button className="primary-button" type="button" onClick={() => roomAction("nextRound")} disabled={busy} data-testid="button-next-round"><RefreshCw size={16} /> Play another round</button>}
                {!host && <div className="waiting-status" data-testid="status-waiting-rematch"><span className="pulse-mark" /> Waiting for the host to deal again.</div>}
                <button className="secondary-button full-button" type="button" onClick={leaveRoom} disabled={busy} data-testid="button-leave-results"><LogOut size={14} /> Leave this room</button>
              </div>
            </section>
          )}
        </main>
      )}

      {error && <div className="toast" role="alert" data-testid="status-error"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss message" data-testid="button-dismiss-error"><X size={15} /></button></div>}
      <footer className="app-footer"><span>WORD IMPOSTOR</span><span>PRIVATE BY DESIGN</span></footer>
    </div>
  );
}

function PlayerRow({ person, index, host, onRemove, lobby = false }: { person: RoomPlayerView; index: number; host: boolean; onRemove: (person: RoomPlayerView) => void; lobby?: boolean }) {
  return <div className="roster-person" data-testid={`row-player-${person.id}`}>
    <span className="roster-number">{String(index + 1).padStart(2, "0")}</span>
    <span className="avatar">{initials(person.name)}</span>
    <div className="roster-name"><strong>{person.name}</strong><span>{person.isHost ? "HOST" : person.isBot ? "BOT" : person.connected ? "CONNECTED" : "RECONNECTING"}</span></div>
    <span className={`presence ${person.connected || person.isBot ? "present" : ""}`} aria-label={person.connected ? "Connected" : "Disconnected"} />
    {host && !person.isHost && lobby && <button type="button" className="remove-player" onClick={() => onRemove(person)} aria-label={`Remove ${person.name}`} data-testid={`button-remove-player-${person.id}`}><X size={14} /></button>}
    {lobby && <span className="player-score">{person.score}</span>}
  </div>;
}

function PrivateCard({ role, visible, onToggle, categoryLabel }: { role: PrivateRolePayload | null; visible: boolean; onToggle: () => void; categoryLabel: string }) {
  return <div className={`private-card ${visible ? "is-open" : ""}`} data-testid="panel-private-role">
    <div className="private-card-head"><span><LockKeyhole size={13} /> Only you can see this</span><button type="button" onClick={onToggle} data-testid="button-toggle-secret">{visible ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Reveal</>}</button></div>
    {visible && role ? <div className="private-card-content"><span className={`role-label ${role.role === "IMPOSTOR" ? "impostor-label" : ""}`}>{role.role === "IMPOSTOR" ? "You are the impostor" : "You are with the crew"}</span><strong data-testid="text-private-word">{role.role === "IMPOSTOR" ? "No word for you." : role.word}</strong><span data-testid="text-private-category">{categoryLabel}</span></div> : <div className="private-card-hidden"><span className="secret-line" /><span className="secret-line short" /><span className="hidden-caption">{role ? "Your role is covered" : "Your private role arrives when the round begins"}</span></div>}
  </div>;
}

export default App;
