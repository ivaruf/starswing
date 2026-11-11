# Letting go: a short breath of air that opens upward. Quiet; it happens
# every few seconds.
with_fx :hpf, cutoff: 70 do
  s = synth :bnoise, attack: 0.02, sustain: 0.05, release: 0.25, amp: 0.3, cutoff: 80, cutoff_slide: 0.25
  control s, cutoff: 120
end
