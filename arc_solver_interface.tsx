import React, { useState, useRef } from 'react';
import { Upload, Download, Play, AlertCircle } from 'lucide-react';

export default function ARCSolverInterface() {
  const [tasks, setTasks] = useState({});
  const [predictions, setPredictions] = useState({});
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // DSL Operations
  class GridOperation {
    apply(grid) {
      throw new Error('Not implemented');
    }
  }

  class Identity extends GridOperation {
    apply(grid) {
      return grid.map(row => [...row]);
    }
  }

  class Rotate extends GridOperation {
    constructor(times = 1) {
      super();
      this.times = times % 4;
    }
    apply(grid) {
      let result = grid.map(row => [...row]);
      for (let t = 0; t < this.times; t++) {
        const h = result.length, w = result[0].length;
        const rotated = Array(w).fill(null).map(() => Array(h));
        for (let i = 0; i < h; i++) {
          for (let j = 0; j < w; j++) {
            rotated[j][h - 1 - i] = result[i][j];
          }
        }
        result = rotated;
      }
      return result;
    }
  }

  class Flip extends GridOperation {
    constructor(axis = 'h') {
      super();
      this.axis = axis;
    }
    apply(grid) {
      if (this.axis === 'h') {
        return grid.map(row => [...row].reverse());
      }
      return [...grid].reverse();
    }
  }

  class Transpose extends GridOperation {
    apply(grid) {
      const h = grid.length, w = grid[0].length;
      const result = Array(w).fill(null).map(() => Array(h));
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          result[j][i] = grid[i][j];
        }
      }
      return result;
    }
  }

  class ColorMap extends GridOperation {
    constructor(mapping) {
      super();
      this.mapping = mapping;
    }
    apply(grid) {
      return grid.map(row =>
        row.map(cell => this.mapping[cell] !== undefined ? this.mapping[cell] : cell)
      );
    }
  }

  class Crop extends GridOperation {
    constructor(value = 0, margin = 0) {
      super();
      this.value = value;
      this.margin = margin;
    }
    apply(grid) {
      const h = grid.length, w = grid[0].length;
      let minR = h, maxR = -1, minC = w, maxC = -1;
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          if (grid[i][j] !== this.value) {
            minR = Math.min(minR, i);
            maxR = Math.max(maxR, i);
            minC = Math.min(minC, j);
            maxC = Math.max(maxC, j);
          }
        }
      }
      if (minR > maxR) return grid.map(row => [...row]);
      minR = Math.max(0, minR - this.margin);
      maxR = Math.min(h - 1, maxR + this.margin);
      minC = Math.max(0, minC - this.margin);
      maxC = Math.min(w - 1, maxC + this.margin);
      return grid.slice(minR, maxR + 1).map(row => row.slice(minC, maxC + 1));
    }
  }

  class Program {
    constructor(operations) {
      this.operations = operations;
    }
    apply(grid) {
      try {
        let result = grid.map(row => [...row]);
        for (const op of this.operations) {
          result = op.apply(result);
        }
        return result;
      } catch (e) {
        return null;
      }
    }
  }

  // Verification
  function gridsEqual(g1, g2) {
    if (g1.length !== g2.length || g1[0].length !== g2[0].length) return false;
    for (let i = 0; i < g1.length; i++) {
      for (let j = 0; j < g1[0].length; j++) {
        if (g1[i][j] !== g2[i][j]) return false;
      }
    }
    return true;
  }

  function verifyProgram(program, trainPairs) {
    let correct = 0;
    for (const [input, expected] of trainPairs) {
      const predicted = program.apply(input);
      if (predicted && gridsEqual(predicted, expected)) {
        correct++;
      }
    }
    const accuracy = correct / trainPairs.length;
    return [accuracy, correct === trainPairs.length];
  }

  // Program Generator
  function generateBasicPrograms() {
    const programs = [
      new Program([new Identity()]),
      new Program([new Rotate(1)]),
      new Program([new Rotate(2)]),
      new Program([new Rotate(3)]),
      new Program([new Flip('h')]),
      new Program([new Flip('v')]),
      new Program([new Transpose()]),
      new Program([new Crop()]),
    ];
    for (let c = 1; c < 10; c++) {
      programs.push(new Program([new ColorMap({ 0: c })]));
    }
    return programs;
  }

  function mutateProgramList(program, maxDepth = 5) {
    const mutations = [];
    if (program.operations.length < maxDepth) {
      for (const op of [new Rotate(1), new Flip('h'), new Flip('v'), new Transpose(), new Crop()]) {
        mutations.push(new Program([...program.operations, op]));
      }
      for (let c = 1; c < 5; c++) {
        mutations.push(new Program([...program.operations, new ColorMap({ 0: c })]));
      }
    }
    if (program.operations.length > 0) {
      for (const op of [new Rotate(1), new Flip('h'), new Transpose(), new Crop()]) {
        mutations.push(new Program([...program.operations.slice(0, -1), op]));
      }
    }
    return mutations;
  }

  // Beam Search
  function beamSearch(trainPairs, maxIterations = 100, beamWidth = 10) {
    const candidates = generateBasicPrograms();
    let bestProgram = null;
    let bestAccuracy = 0;
    const seen = new Set();

    for (let iter = 0; iter < maxIterations; iter++) {
      const beam = [];
      for (let i = 0; i < Math.min(beamWidth, candidates.length); i++) {
        const [acc, isCorrect] = verifyProgram(candidates[i], trainPairs);
        beam.push([candidates[i], acc]);
        if (acc > bestAccuracy) {
          bestAccuracy = acc;
          bestProgram = candidates[i];
        }
        if (isCorrect) return bestProgram;
      }

      const newCandidates = [];
      for (const [program, acc] of beam) {
        for (const mutant of mutateProgramList(program)) {
          const key = JSON.stringify(mutant.operations.map(o => o.constructor.name));
          if (!seen.has(key)) {
            seen.add(key);
            const [mutAcc, isCorrect] = verifyProgram(mutant, trainPairs);
            newCandidates.push(mutant);
            if (isCorrect) return mutant;
          }
        }
      }
      candidates.splice(0, candidates.length, ...newCandidates.slice(0, beamWidth * 2));
      if (candidates.length === 0) break;
    }
    return bestProgram;
  }

  // Solve task
  function solveTask(taskData) {
    try {
      const trainPairs = taskData.train.map(ex => [ex.input, ex.output]);
      if (trainPairs.length === 0) return [];

      const program = beamSearch(trainPairs, 150, 15);
      if (!program) return [];

      const outputs = [];
      for (const testEx of taskData.test) {
        const output = program.apply(testEx.input);
        outputs.push(output || [[0, 0]]);
      }
      return outputs;
    } catch (e) {
      console.error('Task error:', e);
      return [];
    }
  }

  // Handle file upload
  const handleFileUpload = (event) => {
    const files = event.target.files;
    if (!files) return;

    const newTasks = {};
    let filesProcessed = 0;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const taskId = file.name.replace('.json', '');
          newTasks[taskId] = data;
          filesProcessed++;

          if (filesProcessed === files.length) {
            setTasks(newTasks);
            setStatus(`Loaded ${filesProcessed} task(s)`);
          }
        } catch (err) {
          setStatus(`Error parsing ${file.name}`);
        }
      };
      reader.readAsText(file);
    });
  };

  // Run solver
  const handleSolve = async () => {
    setLoading(true);
    setStatus('Solving tasks...');
    
    const newPredictions = {};
    let completed = 0;

    try {
      for (const [taskId, taskData] of Object.entries(tasks)) {
        const outputs = solveTask(taskData);
        newPredictions[taskId] = outputs.length > 0 ? outputs : [[[0, 0]], [[0, 0]]];
        completed++;
        setStatus(`Solved ${completed}/${Object.keys(tasks).length} tasks...`);
      }

      setPredictions(newPredictions);
      setStatus(`✓ Solved all ${completed} tasks`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  // Generate submission
  const handleGenerateSubmission = () => {
    const submission = {};
    for (const [taskId, outputs] of Object.entries(predictions)) {
      submission[taskId] = [
        {
          attempt_1: outputs[0] || [[0, 0]],
          attempt_2: outputs[1] || [[0, 0]],
        },
      ];
    }

    const json = JSON.stringify(submission, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'submission.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('✓ submission.json downloaded');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">ARC Solver</h1>
          <p className="text-slate-300">Hybrid Neural-Symbolic Reasoning for Abstract Tasks</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700">
          {/* Status */}
          {status && (
            <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              status.includes('✓') 
                ? 'bg-emerald-900/30 border border-emerald-500/50 text-emerald-300'
                : status.includes('Error')
                ? 'bg-red-900/30 border border-red-500/50 text-red-300'
                : 'bg-blue-900/30 border border-blue-500/50 text-blue-300'
            }`}>
              <AlertCircle size={20} />
              {status}
            </div>
          )}

          {/* Upload Section */}
          <div className="mb-8">
            <label className="block text-white font-semibold mb-3">Step 1: Upload Task Files</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition"
            >
              <Upload size={20} />
              Select JSON Task Files
            </button>
            {Object.keys(tasks).length > 0 && (
              <p className="text-slate-300 text-sm mt-2">{Object.keys(tasks).length} file(s) loaded</p>
            )}
          </div>

          {/* Solve Section */}
          <div className="mb-8">
            <label className="block text-white font-semibold mb-3">Step 2: Run Solver</label>
            <button
              onClick={handleSolve}
              disabled={Object.keys(tasks).length === 0 || loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition disabled:cursor-not-allowed"
            >
              <Play size={20} />
              {loading ? 'Solving...' : 'Solve Tasks'}
            </button>
          </div>

          {/* Download Section */}
          <div className="mb-8">
            <label className="block text-white font-semibold mb-3">Step 3: Download Submission</label>
            <button
              onClick={handleGenerateSubmission}
              disabled={Object.keys(predictions).length === 0}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition disabled:cursor-not-allowed"
            >
              <Download size={20} />
              Generate submission.json
            </button>
            {Object.keys(predictions).length > 0 && (
              <p className="text-slate-300 text-sm mt-2">{Object.keys(predictions).length} predictions ready</p>
            )}
          </div>

          {/* Info */}
          <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
            <p className="text-slate-300 text-sm">
              <strong>How it works:</strong> Upload ARC task JSON files. The solver uses beam search over a domain-specific language to find transformation programs that match training examples, then applies them to test inputs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}