# RS Levels for Thinkorswim
# Display-only starter study.
#
# Use RS Levels Capture > Copy Thinkorswim study to copy a generated version
# containing the latest captured levels for one chart. Replace this source with
# the generated study, then save it.

declare upper;

input showInstructions = yes;

AddLabel(
    showInstructions,
    "RS Levels: copy a generated Thinkorswim study from the browser extension",
    CreateColor(145, 164, 187)
);
