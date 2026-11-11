export interface SampleGame {
  id: string;
  title: string;
  subtitle: string;
  pgn: string;
}

export const SAMPLE_GAMES: SampleGame[] = [
  {
    id: "kasparov-topalov-1999",
    title: "Kasparov vs Topalov (1999)",
    subtitle: "Kasparov's Immortal • Famous 24. Rxd4!! sacrifice",
    pgn: `[Event "Hoogovens"]
[Site "Wijk aan Zee NED"]
[Date "1999.01.20"]
[Round "4"]
[White "Kasparov, Garry"]
[Black "Topalov, Veselin"]
[WhiteElo "2812"]
[BlackElo "2700"]
[Result "1-0"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7
8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O
14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5
20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4
25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7
30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2
35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3
40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`,
  },
  {
    id: "opera-game-1858",
    title: "Morphy vs Allies (1858)",
    subtitle: "The Opera Game • Masterclass in rapid development & sacrifice",
    pgn: `[Event "Paris Opera"]
[Site "Paris FRA"]
[Date "1858.11.02"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6
7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7
12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8
17. Rd8# 1-0`,
  },
  {
    id: "tactical-blunders-demo",
    title: "Club Blunder & Miss Showcase",
    subtitle: "Great for testing Blunders, Misses, Forks & Retry Mode",
    pgn: `[Event "Rapid Review Practice"]
[White "ClubPlayer"]
[Black "TacticsTester"]
[WhiteElo "1240"]
[BlackElo "1265"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+
7. Bd2 Bxd2+ 8. Nbxd2 d5 9. exd5 Nxd5 10. Qb3 Na5 11. Qa4+ c6
12. Bxd5 Qxd5 13. O-O O-O 14. Rfe1 b6 15. Re5 Qd6 16. Rae1 Be6
17. Qc2 Rfd8 18. Ng5 g6 19. Nxe6 fxe6 20. Rxe6 Qxd4 21. Nf3 Qd3
22. Re8+ Rxe8 23. Rxe8+ Rxe8 24. Qxd3 1-0`,
  },
];
