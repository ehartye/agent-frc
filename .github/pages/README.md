# Maintain the robot design field guide

Edit the ordered stages and the skill-to-stage mapping in `guide.mjs`. Each stage records the student’s decision, activity, handoff, supporting skills and further reading. The build checks linked repository files and requires every installed skill directory to appear in the guide.

Generate a local preview with Node 22 from the repository root. Choose an empty output directory. Open the generated `index.html` in a browser.

```sh
node .github/pages/build.mjs artifacts/workflow-guide
```

The build generates the classroom lab from the invented training profile and current renderer. Real season models belong to their team projects. Each push to main rebuilds the published guide and lab. Relevant pull requests build the site for review. Only the generated output is uploaded to GitHub Pages.

Keep original illustrations and explanatory text here. Link to the project-owned model authoring guide for source and revision requirements. The illustrative poses and the loader-rate exercise are teaching assumptions. Update the workflow mapping whenever skills or educational objectives change.
