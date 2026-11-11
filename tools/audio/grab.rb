# A star is caught: one plucked C4 with a soft sine under it and a little
# room. js/audio.js plays it at a playbackRate up C major pentatonic, so this
# is the lowest note of the climb's tune.
with_fx :reverb, room: 0.7, mix: 0.35 do
  synth :pluck, note: :c4, attack: 0, release: 1.2, amp: 0.9
  synth :sine, note: :c4, attack: 0.005, release: 0.6, amp: 0.35
  synth :sine, note: :c5, attack: 0.005, release: 0.3, amp: 0.12
end
