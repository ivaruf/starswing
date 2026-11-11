# Stardust: a tiny glass bell on C6. Rated up the pentatonic by js/audio.js
# while the pieces keep coming.
with_fx :reverb, room: 0.6, mix: 0.3 do
  synth :pretty_bell, note: :c6, attack: 0.002, release: 0.5, amp: 0.4
  synth :sine, note: :c7, attack: 0.002, release: 0.2, amp: 0.1
end
