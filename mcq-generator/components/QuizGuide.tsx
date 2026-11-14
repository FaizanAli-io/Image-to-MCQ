import { miniQuizCounts } from '@/lib/mini-quiz-config';
import Image from 'next/image';

export default function QuizGuide() {
  return <details className="quiz-guide">
    <summary>ⓘ Which quiz type should I choose?</summary>
    <h2>Which quiz type should I choose?</h2>
    <p>Both create exam-style questions, but they’re designed for different revision goals.</p>
    <div className="overflow-x-auto"><table>
      <caption className="sr-only">Compare Mini Quiz and Retrieval Quiz</caption>
      <thead><tr><th scope="col"><span className="sr-only">Compare</span></th><th scope="col"><div className="quiz-guide-heading"><Image src="/data/mini-quiz-icon.png" alt="" width={72} height={72} />Mini Quiz</div></th><th scope="col"><div className="quiz-guide-heading"><Image src="/data/retrieval-quiz-icon.png" alt="" width={72} height={72} />Retrieval Quiz</div></th></tr></thead>
      <tbody>
        <tr><th scope="row">Use it when</th><td>You want in-depth practice.</td><td>You need a quick refresh of content.</td></tr>
        <tr><th scope="row">Content</th><td>One topic from textbook pages or notes.</td><td>A range of 3 different topics.</td></tr>
        <tr><th scope="row">Questions</th><td>{miniQuizCounts('GCSE').total} questions (GCSE) or {miniQuizCounts('A-LEVEL').total} questions (A-level).<br />Short–medium length written answers.</td><td>30 questions.<br />Multiple choice.</td></tr>
        <tr><th scope="row">Time taken</th><td><span>30–45 mins</span></td><td><span>10–15 mins</span></td></tr>
      </tbody>
    </table></div>
  </details>;
}
