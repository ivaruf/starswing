# The comet is lost: a gentle falling line that settles home on C. "Again?",
# not a buzzer.
with_fx :reverb, room: 0.85, mix: 0.45 do
  [[:a4, 0.22], [:g4, 0.22], [:e4, 0.22], [:d4, 0.3], [:c4, 0.9]].each do |n, d|
    synth :pluck, note: n, attack: 0, release: d + 0.7, amp: 0.7
    synth :sine, note: n, attack: 0.01, release: d + 0.3, amp: 0.25
    sleep d
  end
  synth :hollow, notes: [:c3, :g3], attack: 0.2, sustain: 0.4, release: 1.4, amp: 0.5
end
