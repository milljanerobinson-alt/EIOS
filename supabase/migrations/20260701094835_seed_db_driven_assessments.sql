
-- Add anon read access so the quiz flow (unauthenticated) can load questions
DROP POLICY IF EXISTS "assessments_select_public" ON assessments;
CREATE POLICY "assessments_select_public" ON assessments
  FOR SELECT TO anon USING (status = 'active');

DROP POLICY IF EXISTS "questions_select_public" ON assessment_questions;
CREATE POLICY "questions_select_public" ON assessment_questions
  FOR SELECT TO anon USING (true);

-- Seed assessments and all questions using a DO block so we can capture the generated IDs
DO $migration$
DECLARE
  lln_id  uuid;
  dig_id  uuid;
BEGIN
  -- Idempotent: skip if already seeded
  IF EXISTS (
    SELECT 1 FROM assessments
    WHERE type = 'lln' AND title = 'LLN Assessment' AND status = 'active'
  ) THEN
    RETURN;
  END IF;

  -- ── Seed LLN Assessment ────────────────────────────────────────────────────
  INSERT INTO assessments (
    type, title, description, status, version,
    total_questions, pass_threshold, acsf_level_mapping
  )
  VALUES (
    'lln',
    'LLN Assessment',
    'Language, Literacy, Numeracy and Learning Assessment',
    'active',
    '1.0.0',
    0,
    50,
    '{"reading":3,"numeracy":3,"writing":3,"oral_communication":3,"learning":3}'::jsonb
  )
  RETURNING id INTO lln_id;

  -- ── Seed Digital Assessment ────────────────────────────────────────────────
  INSERT INTO assessments (
    type, title, description, status, version,
    total_questions, pass_threshold, acsf_level_mapping
  )
  VALUES (
    'digital',
    'Digital Capability Assessment',
    'Workplace Digital Literacy Assessment',
    'active',
    '1.0.0',
    0,
    50,
    '{"digital_literacy":3}'::jsonb
  )
  RETURNING id INTO dig_id;

  -- ── LLN Questions ─────────────────────────────────────────────────────────
  -- Columns: assessment_id, question_text, domain, acsf_skill, acsf_level_target,
  --          question_type, options, correct_answer, order_index
  INSERT INTO assessment_questions
    (assessment_id, question_text, domain, acsf_skill, acsf_level_target, question_type, options, correct_answer, order_index)
  VALUES

  -- READING level 1
  (lln_id, 'Look at this safety sign: "CAUTION: WET FLOOR". What does this sign warn you about?', 'literacy', 'reading', 1, 'multiple_choice', '["A wet or slippery floor","A broken floor","A dirty floor","A new floor"]'::jsonb, '"A wet or slippery floor"'::jsonb, 0),
  (lln_id, 'Read this sentence: "The meeting is at 9am in Room 4." Where is the meeting?', 'literacy', 'reading', 1, 'multiple_choice', '["Room 1","Room 2","Room 3","Room 4"]'::jsonb, '"Room 4"'::jsonb, 1),
  (lln_id, 'A notice says: "No food or drink allowed in this area." What is NOT allowed here?', 'literacy', 'reading', 1, 'multiple_choice', '["Phones","Food and drink","Bags","Books"]'::jsonb, '"Food and drink"'::jsonb, 2),

  -- READING level 2
  (lln_id, 'Read this message: "Hi Sarah, your appointment has been changed to Thursday at 2pm. Please bring your photo ID." When is the new appointment?', 'literacy', 'reading', 2, 'multiple_choice', '["Monday","Tuesday","Wednesday","Thursday"]'::jsonb, '"Thursday"'::jsonb, 3),
  (lln_id, 'A work timetable shows: Monday 8am–4pm, Friday 9am–3pm. How many hours does this person work on Friday?', 'literacy', 'reading', 2, 'multiple_choice', '["5 hours","6 hours","7 hours","8 hours"]'::jsonb, '"6 hours"'::jsonb, 4),
  (lln_id, 'Read this notice: "Staff must sign in before 8:30am. Late arrivals must report to the supervisor on duty and complete a late arrival form." What must late arrivals do?', 'literacy', 'reading', 2, 'multiple_choice', '["Go home and return the next day","Nothing – just start work","Report to the supervisor and complete a form","Call the manager"]'::jsonb, '"Report to the supervisor and complete a form"'::jsonb, 5),

  -- READING level 3
  (lln_id, 'Read this extract: "All employees are required to complete mandatory safety training within their first four weeks. Failure to complete this training may result in suspension of duties until the training is finalised." What will happen if an employee does not complete safety training?', 'literacy', 'reading', 3, 'multiple_choice', '["They will receive a pay increase","They will be dismissed immediately","Their duties may be suspended until training is complete","Nothing will happen"]'::jsonb, '"Their duties may be suspended until training is complete"'::jsonb, 6),
  (lln_id, 'A brochure states: "The Certificate III in Business Administration is a nationally recognised qualification. Students who complete this course will develop skills in administration, customer service and basic financial processes." What does this qualification prepare students for?', 'literacy', 'reading', 3, 'multiple_choice', '["Medical work","Restaurant work","Administration and business support roles","Construction and trades work"]'::jsonb, '"Administration and business support roles"'::jsonb, 7),
  (lln_id, 'A workplace email states: "All staff in the warehouse are required to wear high-visibility vests at all times, effective from Monday 9am. This applies to visitors as well as regular staff." Who must wear high-visibility vests?', 'literacy', 'reading', 3, 'multiple_choice', '["Only warehouse managers","Only visitors","All warehouse staff and visitors","Only regular staff, not visitors"]'::jsonb, '"All warehouse staff and visitors"'::jsonb, 8),

  -- READING level 4
  (lln_id, 'A report states: "While revenue grew by 12% in Q3, operating costs increased by 18% in the same period, resulting in a net reduction in profit margin." What happened to profit margin in Q3?', 'literacy', 'reading', 4, 'multiple_choice', '["It increased due to higher revenue","It stayed the same as Q2","It decreased due to higher operating costs","It increased by 3.2 percentage points"]'::jsonb, '"It decreased due to higher operating costs"'::jsonb, 9),
  (lln_id, 'A policy states: "Contractors are subject to the same work, health and safety obligations as direct employees. Failure to comply will result in termination of the contractual arrangement, regardless of the stage of completion of any project." What does this mean for contractors?', 'literacy', 'reading', 4, 'multiple_choice', '["They have fewer safety obligations than employees","They have the same safety obligations as employees","They are exempt from safety rules if their project is almost finished","They have more safety obligations than employees"]'::jsonb, '"They have the same safety obligations as employees"'::jsonb, 10),
  (lln_id, 'Monthly satisfaction scores: Jan 72%, Feb 68%, Mar 75%, Apr 80%, May 78%, Jun 85%. What trend does this data show overall?', 'literacy', 'reading', 4, 'multiple_choice', '["Satisfaction consistently decreased","Satisfaction had no clear pattern","Satisfaction generally increased despite some variation","Satisfaction stayed exactly the same"]'::jsonb, '"Satisfaction generally increased despite some variation"'::jsonb, 11),

  -- READING level 5
  (lln_id, 'A research report states: "While the correlation between workplace literacy and productivity has been well established, the causal relationship remains contested. Some researchers argue that organisational culture, rather than individual literacy levels, may be the primary driver of productivity outcomes." What is the main point being made?', 'literacy', 'reading', 5, 'multiple_choice', '["Workplace literacy directly causes productivity","The link between literacy and productivity is definitively proven","The cause of productivity differences may be more complex than literacy alone","Organisational culture has no impact on productivity"]'::jsonb, '"The cause of productivity differences may be more complex than literacy alone"'::jsonb, 12),
  (lln_id, 'A legislative brief states: "The proposed amendment would extend duty of care provisions to digital platforms. Proponents argue this increases accountability; critics contend the broad scope risks creating regulatory burden disproportionate to identifiable harm." What is a key argument made AGAINST the amendment?', 'literacy', 'reading', 5, 'multiple_choice', '["It would remove existing duty of care provisions","It may create excessive regulatory burden relative to actual harm","It would benefit digital platform providers","It would reduce accountability for online service providers"]'::jsonb, '"It may create excessive regulatory burden relative to actual harm"'::jsonb, 13),
  (lln_id, 'An abstract reads: "Findings suggest that while formative assessment correlates with improved learner engagement, its impact on summative outcomes is mediated by instructor fidelity to assessment design principles." What does "mediated by instructor fidelity to assessment design principles" mean here?', 'literacy', 'reading', 5, 'multiple_choice', '["Teachers always follow assessment designs exactly","The effect on final results depends on how well teachers implement assessment designs","Assessment designs are always effective regardless of teaching","Teachers rarely follow assessment designs"]'::jsonb, '"The effect on final results depends on how well teachers implement assessment designs"'::jsonb, 14),

  -- NUMERACY level 1
  (lln_id, 'You have 12 apples. You give 4 to a friend. How many do you have left?', 'numeracy', 'numeracy', 1, 'multiple_choice', '["6","7","8","9"]'::jsonb, '"8"'::jsonb, 15),
  (lln_id, 'Which of these numbers is the largest?', 'numeracy', 'numeracy', 1, 'multiple_choice', '["17","71","27","72"]'::jsonb, '"72"'::jsonb, 16),
  (lln_id, 'You need to be at work at 8:00am. It takes you 30 minutes to get there. What time should you leave home?', 'numeracy', 'numeracy', 1, 'multiple_choice', '["7:00am","7:30am","8:30am","9:00am"]'::jsonb, '"7:30am"'::jsonb, 17),

  -- NUMERACY level 2
  (lln_id, 'A sandwich costs $4.50 and a drink costs $2.00. How much do they cost together?', 'numeracy', 'numeracy', 2, 'multiple_choice', '["$5.50","$6.00","$6.50","$7.00"]'::jsonb, '"$6.50"'::jsonb, 18),
  (lln_id, 'A piece of rope is 80cm long. You cut it in half. How long is each piece?', 'numeracy', 'numeracy', 2, 'multiple_choice', '["20cm","30cm","40cm","50cm"]'::jsonb, '"40cm"'::jsonb, 19),
  (lln_id, 'A class starts at 10:00am and runs for 2.5 hours. What time does it finish?', 'numeracy', 'numeracy', 2, 'multiple_choice', '["11:30am","12:00pm","12:30pm","1:00pm"]'::jsonb, '"12:30pm"'::jsonb, 20),

  -- NUMERACY level 3
  (lln_id, 'A store is offering 20% off all items. A jacket normally costs $80. How much will it cost with the discount?', 'numeracy', 'numeracy', 3, 'multiple_choice', '["$16","$60","$64","$70"]'::jsonb, '"$64"'::jsonb, 21),
  (lln_id, 'Weekly sales: Mon 150, Tue 120, Wed 180, Thu 90, Fri 160. What was the average daily sales across the five days?', 'numeracy', 'numeracy', 3, 'multiple_choice', '["130 units","140 units","150 units","160 units"]'::jsonb, '"140 units"'::jsonb, 22),
  (lln_id, 'A worker earns $20 per hour and works 38 hours this week. How much do they earn in total?', 'numeracy', 'numeracy', 3, 'multiple_choice', '["$680","$720","$760","$800"]'::jsonb, '"$760"'::jsonb, 23),

  -- NUMERACY level 4
  (lln_id, 'A business had revenue of $450,000 in 2022. Revenue grew by 15% in 2023. What was the revenue in 2023?', 'numeracy', 'numeracy', 4, 'multiple_choice', '["$450,000","$495,000","$502,500","$517,500"]'::jsonb, '"$517,500"'::jsonb, 24),
  (lln_id, 'A recipe requires ingredients in the ratio 3:2:1 (flour:sugar:butter). If you use 450g of flour, how much sugar do you need?', 'numeracy', 'numeracy', 4, 'multiple_choice', '["150g","200g","250g","300g"]'::jsonb, '"300g"'::jsonb, 25),
  (lln_id, 'A survey shows a service was rated by 120 people. The mean score was 7.2/10, the median was 7/10 and the mode was 6/10. A manager says "most customers were highly satisfied." Which statistic BEST challenges this claim?', 'numeracy', 'numeracy', 4, 'multiple_choice', '["The mean is 7.2, which is above average","The mode is 6, suggesting more people gave a lower score than any other single score","The median is 7, which means half gave 7 or above","None of the statistics challenge this claim"]'::jsonb, '"The mode is 6, suggesting more people gave a lower score than any other single score"'::jsonb, 26),

  -- NUMERACY level 5
  (lln_id, 'A project has a budget of $120,000. After Q1, 35% of the budget has been spent and the project is 25% complete. At this rate, what is the estimated cost overrun at completion?', 'numeracy', 'numeracy', 5, 'multiple_choice', '["$24,000","$36,000","$48,000","The project will come in under budget"]'::jsonb, '"$48,000"'::jsonb, 27),
  (lln_id, 'A company''s profit margin is 12%. If costs increase by 8% while revenue stays the same, and the original cost-to-revenue ratio was 88%, what happens to profit margin?', 'numeracy', 'numeracy', 5, 'multiple_choice', '["It increases to 20%","It stays at 12%","It decreases to about 4%","It decreases to 6%"]'::jsonb, '"It decreases to about 4%"'::jsonb, 28),
  (lln_id, 'Ten students scored: 60, 75, 70, 80, 65, 75, 55, 90, 75, 65. What is the mean score?', 'numeracy', 'numeracy', 5, 'multiple_choice', '["68","71","72.5","75"]'::jsonb, '"71"'::jsonb, 29),

  -- WRITING level 1
  (lln_id, 'Which sentence is written correctly?', 'literacy', 'writing', 1, 'multiple_choice', '["the dog is happy","The dog is happy.","The Dog Is Happy.","the Dog is Happy"]'::jsonb, '"The dog is happy."'::jsonb, 30),
  (lln_id, 'Choose the correctly spelled word:', 'literacy', 'writing', 1, 'multiple_choice', '["beleive","beleave","believe","belive"]'::jsonb, '"believe"'::jsonb, 31),
  (lln_id, 'Which sentence makes sense?', 'literacy', 'writing', 1, 'multiple_choice', '["Dog the ran fast.","The fast ran dog.","The dog ran fast.","Fast the dog ran."]'::jsonb, '"The dog ran fast."'::jsonb, 32),

  -- WRITING level 2
  (lln_id, 'Which sentence uses the correct punctuation?', 'literacy', 'writing', 2, 'multiple_choice', '["Ive finished my assignment","I''ve finished my assignment.","Ive'' finished my assignment.","I''ve, finished my assignment"]'::jsonb, '"I''ve finished my assignment."'::jsonb, 33),
  (lln_id, 'Choose the word that correctly completes this sentence: ''The manager asked the staff ___ attend the meeting.''', 'literacy', 'writing', 2, 'multiple_choice', '["to","too","two","tow"]'::jsonb, '"to"'::jsonb, 34),
  (lln_id, 'Which version of this sentence is clearest and most correct?', 'literacy', 'writing', 2, 'multiple_choice', '["The report, it needs to being completed by Monday.","The report needs to be completed by Monday.","The report needing completion by Monday.","Monday is when the report needs being done."]'::jsonb, '"The report needs to be completed by Monday."'::jsonb, 35),

  -- WRITING level 3
  (lln_id, 'A workplace email begins: ''Hey, just wanted 2 let u know the meeting got moved lol.'' What is the main problem with this email?', 'literacy', 'writing', 3, 'multiple_choice', '["It is too short","It uses informal and unprofessional language","It does not mention a meeting","It is written in the wrong font"]'::jsonb, '"It uses informal and unprofessional language"'::jsonb, 36),
  (lln_id, 'Which sentence is in passive voice?', 'literacy', 'writing', 3, 'multiple_choice', '["The manager approved the report.","The report was approved by the manager.","The manager has approved the report.","The approval was straightforward."]'::jsonb, '"The report was approved by the manager."'::jsonb, 37),
  (lln_id, 'Choose the correctly structured sentence:', 'literacy', 'writing', 3, 'multiple_choice', '["Despite the rain, the event went ahead as planned.","Despite the rain the event went ahead as planned","Despite the rain, the event, went ahead as planned.","Despite the rain the event, went ahead, as planned."]'::jsonb, '"Despite the rain, the event went ahead as planned."'::jsonb, 38),

  -- WRITING level 4
  (lln_id, 'A report introduction states: ''This report will look at stuff about the company and what it does and some problems.'' What is the main weakness of this introduction?', 'literacy', 'writing', 4, 'multiple_choice', '["It is too formal","It lacks specificity and clear purpose","It is too long","It uses the passive voice"]'::jsonb, '"It lacks specificity and clear purpose"'::jsonb, 39),
  (lln_id, 'Which sentence uses parallel structure correctly?', 'literacy', 'writing', 4, 'multiple_choice', '["The new process improves efficiency, reduces errors, and it will save costs.","The new process improves efficiency, reduces errors, and saves costs.","The new process improves efficiency, reduces errors, and saving costs.","The new process is improving efficiency, reducing errors, and to save costs."]'::jsonb, '"The new process improves efficiency, reduces errors, and saves costs."'::jsonb, 40),
  (lln_id, 'You are writing a formal report recommendation. Which opening is most appropriate?', 'literacy', 'writing', 4, 'multiple_choice', '["I reckon they should just fix the system.","It is recommended that the current system be reviewed and upgraded within six months.","So basically the system needs fixing.","The system, it has to be fixed soon I think."]'::jsonb, '"It is recommended that the current system be reviewed and upgraded within six months."'::jsonb, 41),

  -- WRITING level 5
  (lln_id, 'Which paragraph is most effective for introducing an argument?', 'literacy', 'writing', 5, 'multiple_choice', '["Climate change is bad. We should do something. There are many problems.","While significant evidence supports the need for urgent climate action, the most effective policy responses remain contested among researchers and policymakers.","Climate change is a major issue in the world today. It has caused many problems. This essay will discuss them.","Everybody knows climate change is real and something needs to be done about it."]'::jsonb, '"While significant evidence supports the need for urgent climate action, the most effective policy responses remain contested among researchers and policymakers."'::jsonb, 42),
  (lln_id, 'A writer argues: ''Remote work should be mandatory because productivity studies show a 13% increase.'' What is the main logical weakness?', 'literacy', 'writing', 5, 'multiple_choice', '["Remote work is actually bad for everyone","The study is definitely wrong","Correlation in one study may not apply universally, and mandatory policy ignores individual circumstances","The percentage is too small to matter"]'::jsonb, '"Correlation in one study may not apply universally, and mandatory policy ignores individual circumstances"'::jsonb, 43),
  (lln_id, 'Which transition phrase BEST shows a contrasting relationship between two ideas?', 'literacy', 'writing', 5, 'multiple_choice', '["Furthermore","As a result","However","In addition"]'::jsonb, '"However"'::jsonb, 44),

  -- ORAL COMMUNICATION level 1
  (lln_id, 'Your supervisor asks you to do a task you do not understand. What is the best thing to do?', 'language', 'oral_communication', 1, 'multiple_choice', '["Do nothing and hope for the best","Politely ask your supervisor to explain the task again","Do the task wrong and fix it later","Ignore the supervisor"]'::jsonb, '"Politely ask your supervisor to explain the task again"'::jsonb, 45),
  (lln_id, 'A customer greets you and says: "Good morning, how are you?" What is the most appropriate response?', 'language', 'oral_communication', 1, 'multiple_choice', '["Don''t say anything","Good morning! I''m well, thank you. How can I help you?","I''m busy right now","Whatever"]'::jsonb, '"Good morning! I''m well, thank you. How can I help you?"'::jsonb, 46),
  (lln_id, 'You need to let your manager know you will be late to work today. What should you do?', 'language', 'oral_communication', 1, 'multiple_choice', '["Don''t say anything and arrive late","Call or message your manager before your shift starts","Arrive late without saying anything and explain when you get there","Ask a coworker to tell your manager"]'::jsonb, '"Call or message your manager before your shift starts"'::jsonb, 47),

  -- ORAL COMMUNICATION level 2
  (lln_id, 'You are at a team meeting and a colleague makes a good suggestion. How do you respond professionally?', 'language', 'oral_communication', 2, 'multiple_choice', '["Say nothing","Interrupt with your own idea immediately","Say ''That''s a great point, and I''d add that we should also consider...''","Roll your eyes and look at your phone"]'::jsonb, '"Say ''That''s a great point, and I''d add that we should also consider...'';"'::jsonb, 48),
  (lln_id, 'A customer is upset about a problem with their order. What is the most effective first step?', 'language', 'oral_communication', 2, 'multiple_choice', '["Tell them it''s not your fault","Apologise and listen carefully to understand the issue","Walk away","Ask them to come back later"]'::jsonb, '"Apologise and listen carefully to understand the issue"'::jsonb, 49),
  (lln_id, 'You need to give instructions to a new team member. What is the best approach?', 'language', 'oral_communication', 2, 'multiple_choice', '["Give all instructions at once as fast as possible","Use clear, simple steps and check they understand at each stage","Write instructions in technical jargon","Assume they already know what to do"]'::jsonb, '"Use clear, simple steps and check they understand at each stage"'::jsonb, 50),

  -- ORAL COMMUNICATION level 3
  (lln_id, 'You are presenting a new idea to your team. A colleague asks a question you cannot answer. What should you do?', 'language', 'oral_communication', 3, 'multiple_choice', '["Make up an answer","Say ''That''s a great question. I''m not sure right now — let me find out and get back to you.''","Dismiss the question","Get angry"]'::jsonb, '"Say ''That''s a great question. I''m not sure right now — let me find out and get back to you.''"'::jsonb, 51),
  (lln_id, 'You need to give feedback to a colleague whose work has errors. How should you approach this?', 'language', 'oral_communication', 3, 'multiple_choice', '["Criticise their work publicly","Send an angry email","Have a private conversation using specific examples and suggest improvements","Ignore the issue"]'::jsonb, '"Have a private conversation using specific examples and suggest improvements"'::jsonb, 52),
  (lln_id, 'During a call, a client mentions a concern about a project deadline. You don''t have the information they need. What do you say?', 'language', 'oral_communication', 3, 'multiple_choice', '["Tell them to call back","Hang up","Say ''I understand your concern. I''ll check with my team and get back to you within 24 hours.''","Make up an answer"]'::jsonb, '"Say ''I understand your concern. I''ll check with my team and get back to you within 24 hours.''"'::jsonb, 53),

  -- ORAL COMMUNICATION level 4
  (lln_id, 'You are facilitating a team meeting where two colleagues strongly disagree. What is the most effective approach?', 'language', 'oral_communication', 4, 'multiple_choice', '["Take one person''s side","End the meeting","Let them argue until they stop","Acknowledge both perspectives, focus on the issue and guide the group towards a solution"]'::jsonb, '"Acknowledge both perspectives, focus on the issue and guide the group towards a solution"'::jsonb, 54),
  (lln_id, 'A senior manager asks for your opinion on a proposed strategy you have concerns about. What do you do?', 'language', 'oral_communication', 4, 'multiple_choice', '["Agree with everything they say","Refuse to give an opinion","Express your concerns respectfully, using evidence and specific examples","Say nothing"]'::jsonb, '"Express your concerns respectfully, using evidence and specific examples"'::jsonb, 55),
  (lln_id, 'You need to deliver a formal presentation to stakeholders about a project update. What is most important to include?', 'language', 'oral_communication', 4, 'multiple_choice', '["Only good news","Technical jargon to show expertise","A clear structure with key updates, risks and recommendations","A very long and detailed explanation of every activity"]'::jsonb, '"A clear structure with key updates, risks and recommendations"'::jsonb, 56),

  -- ORAL COMMUNICATION level 5
  (lln_id, 'You are negotiating a contract with a supplier whose terms do not fully meet your requirements. What is the most effective strategy?', 'language', 'oral_communication', 5, 'multiple_choice', '["Accept the terms immediately","Reject the offer completely with no explanation","Walk out of the negotiation","Clearly state your requirements, explain the rationale and explore mutually beneficial alternatives"]'::jsonb, '"Clearly state your requirements, explain the rationale and explore mutually beneficial alternatives"'::jsonb, 57),
  (lln_id, 'You are presenting complex data to a non-technical audience. What is the most effective communication approach?', 'language', 'oral_communication', 5, 'multiple_choice', '["Use all technical terminology to establish credibility","Present all data without interpretation","Simplify key messages, use visuals and focus on what the data means for the audience","Give a very long and detailed explanation of all methodology"]'::jsonb, '"Simplify key messages, use visuals and focus on what the data means for the audience"'::jsonb, 58),
  (lln_id, 'A colleague consistently interrupts you during team discussions. How would you address this most effectively?', 'language', 'oral_communication', 5, 'multiple_choice', '["Start interrupting them too","Say nothing and let it continue","Say loudly ''Stop interrupting me''","Find a private moment to speak with them calmly, explain the impact of the behaviour and discuss how you can both contribute more effectively"]'::jsonb, '"Find a private moment to speak with them calmly, explain the impact of the behaviour and discuss how you can both contribute more effectively"'::jsonb, 59),

  -- LEARNING level 1
  (lln_id, 'You are trying to learn a new skill at work. What is the MOST effective strategy?', 'literacy', 'learning', 1, 'multiple_choice', '["Read about it once and hope you remember","Practice the skill repeatedly and ask for feedback","Watch someone else do it once only","Avoid difficult parts and focus on what you already know"]'::jsonb, '"Practice the skill repeatedly and ask for feedback"'::jsonb, 60),
  (lln_id, 'You did poorly on a task. What is the best way to respond?', 'literacy', 'learning', 1, 'multiple_choice', '["Give up and avoid similar tasks","Blame others for your poor result","Identify what went wrong and try again with a different approach","Ignore it and move on"]'::jsonb, '"Identify what went wrong and try again with a different approach"'::jsonb, 61),
  (lln_id, 'Before starting a complex task, what should you do?', 'literacy', 'learning', 1, 'multiple_choice', '["Start immediately without any planning","Write down what you need to do and what resources you need","Wait until the last minute to start","Ask someone else to do it for you"]'::jsonb, '"Write down what you need to do and what resources you need"'::jsonb, 62),

  -- LEARNING level 2
  (lln_id, 'You need to learn a complex new software system. What approach would be MOST effective?', 'literacy', 'learning', 2, 'multiple_choice', '["Try to learn everything at once in one long session","Find a tutorial, practice in small chunks and take notes on key steps","Wait for someone to teach you","Guess and hope it works"]'::jsonb, '"Find a tutorial, practice in small chunks and take notes on key steps"'::jsonb, 63),
  (lln_id, 'You are reading a complex document but keep losing track of the key points. What is the best strategy?', 'literacy', 'learning', 2, 'multiple_choice', '["Stop reading","Read it again faster","Take notes as you read, summarising key points in your own words","Skip the parts you find difficult"]'::jsonb, '"Take notes as you read, summarising key points in your own words"'::jsonb, 64),
  (lln_id, 'You have a big project due in three weeks. What is the most effective planning approach?', 'literacy', 'learning', 2, 'multiple_choice', '["Start the night before it''s due","Break the project into smaller tasks with weekly milestones","Plan to do it all in one day","Hope it all comes together at the end"]'::jsonb, '"Break the project into smaller tasks with weekly milestones"'::jsonb, 65),

  -- LEARNING level 3
  (lln_id, 'You have been asked to learn a new skill that is outside your comfort zone. What mindset is most effective?', 'literacy', 'learning', 3, 'multiple_choice', '["Believe that your abilities cannot change","Avoid the challenge as much as possible","View the challenge as an opportunity to grow and focus on the process","Give up if you do not succeed immediately"]'::jsonb, '"View the challenge as an opportunity to grow and focus on the process"'::jsonb, 66),
  (lln_id, 'After completing a major task, what is the best practice for improving future performance?', 'literacy', 'learning', 3, 'multiple_choice', '["Move on immediately to the next task","Conduct a brief self-reflection: what worked well, what could be improved and how you would approach it differently next time","Assume you did everything correctly","Blame any mistakes on external factors"]'::jsonb, '"Conduct a brief self-reflection: what worked well, what could be improved and how you would approach it differently next time"'::jsonb, 67),
  (lln_id, 'You are learning alongside others in a team. How can you maximise your learning?', 'literacy', 'learning', 3, 'multiple_choice', '["Work alone and avoid interacting with others","Ask questions, share your understanding and learn from others'' approaches","Only focus on your own tasks","Avoid asking questions to not look uninformed"]'::jsonb, '"Ask questions, share your understanding and learn from others'' approaches"'::jsonb, 68),

  -- LEARNING level 4
  (lln_id, 'You are managing your own professional development. What is the most strategic approach?', 'literacy', 'learning', 4, 'multiple_choice', '["Only learn what your employer tells you to","Wait for someone to organise training for you","Regularly assess your own skill gaps, seek diverse learning opportunities and connect new learning to your professional goals","Focus only on technical skills directly related to your current role"]'::jsonb, '"Regularly assess your own skill gaps, seek diverse learning opportunities and connect new learning to your professional goals"'::jsonb, 69),
  (lln_id, 'You are reading a research article with arguments you find unconvincing. What is the most critical approach?', 'literacy', 'learning', 4, 'multiple_choice', '["Accept the argument because it is from a published source","Reject it entirely because you disagree","Evaluate the quality of the evidence, identify the assumptions and consider alternative interpretations","Share the article with others without reading it carefully"]'::jsonb, '"Evaluate the quality of the evidence, identify the assumptions and consider alternative interpretations"'::jsonb, 70),
  (lln_id, 'You have been working in the same role for years. Which approach best describes continuous professional learning?', 'literacy', 'learning', 4, 'multiple_choice', '["Rely solely on your existing knowledge and experience","Assume your current skills are sufficient","Actively seek new knowledge, reflect on current practices and adapt your approaches based on evidence and emerging trends","Only learn when required by an employer"]'::jsonb, '"Actively seek new knowledge, reflect on current practices and adapt your approaches based on evidence and emerging trends"'::jsonb, 71),

  -- LEARNING level 5
  (lln_id, 'Which description best represents a highly self-directed learner in a professional context?', 'literacy', 'learning', 5, 'multiple_choice', '["Waits to be told what to learn and when","Learns only from structured courses","Proactively identifies learning needs, curates their own learning resources and integrates new knowledge into their practice","Focuses only on immediate performance requirements"]'::jsonb, '"Proactively identifies learning needs, curates their own learning resources and integrates new knowledge into their practice"'::jsonb, 72),
  (lln_id, 'You are mentoring a junior colleague who is struggling to learn independently. What is the most effective approach?', 'literacy', 'learning', 5, 'multiple_choice', '["Do the work for them","Tell them to figure it out themselves","Help them develop self-assessment skills, ask guiding questions and model effective learning strategies rather than providing direct answers","Assign them more reading material"]'::jsonb, '"Help them develop self-assessment skills, ask guiding questions and model effective learning strategies rather than providing direct answers"'::jsonb, 73),
  (lln_id, 'What distinguishes transformative learning from simple skill acquisition?', 'literacy', 'learning', 5, 'multiple_choice', '["Transformative learning is faster","Transformative learning involves critically examining and potentially revising deeply held assumptions, beliefs and perspectives","Transformative learning only applies to academic settings","Skill acquisition requires more effort than transformative learning"]'::jsonb, '"Transformative learning involves critically examining and potentially revising deeply held assumptions, beliefs and perspectives"'::jsonb, 74);

  -- ── Digital Questions ─────────────────────────────────────────────────────
  INSERT INTO assessment_questions
    (assessment_id, question_text, domain, acsf_skill, acsf_level_target, question_type, options, correct_answer, order_index)
  VALUES

  -- BASIC DIGITAL SKILLS
  (dig_id, 'You receive a file called ''report.pdf''. What type of file is this?', 'digital', 'basic_skills', 3, 'multiple_choice', '["A video file","A spreadsheet","A document that can be viewed but usually not easily edited","An email file"]'::jsonb, '"A document that can be viewed but usually not easily edited"'::jsonb, 0),
  (dig_id, 'What does ''cloud storage'' mean?', 'digital', 'basic_skills', 3, 'multiple_choice', '["Storing files on a USB drive","Saving files on the internet so they can be accessed from multiple devices","Printing files onto paper","Storing files only on your computer''s hard drive"]'::jsonb, '"Saving files on the internet so they can be accessed from multiple devices"'::jsonb, 1),
  (dig_id, 'What should you do if your computer is running very slowly?', 'digital', 'basic_skills', 3, 'multiple_choice', '["Immediately throw it away","Close unnecessary programs and browser tabs that are not being used","Add more files to the desktop","Ignore the issue permanently"]'::jsonb, '"Close unnecessary programs and browser tabs that are not being used"'::jsonb, 2),
  (dig_id, 'Which of the following is an example of a web browser?', 'digital', 'basic_skills', 3, 'multiple_choice', '["Microsoft Word","Google Chrome","Excel","Outlook"]'::jsonb, '"Google Chrome"'::jsonb, 3),
  (dig_id, 'What does it mean to ''copy and paste'' text?', 'digital', 'basic_skills', 3, 'multiple_choice', '["To delete text","To type text again manually","To duplicate text and place it in another location","To change the font of text"]'::jsonb, '"To duplicate text and place it in another location"'::jsonb, 4),

  -- COMMUNICATION & COLLABORATION
  (dig_id, 'You need to share a large file with a colleague. What is the most efficient method?', 'digital', 'communication', 3, 'multiple_choice', '["Print it and hand it to them","Type out all the contents in an email","Share it via cloud storage or a file sharing service","Put it on a USB drive and leave it on their desk"]'::jsonb, '"Share it via cloud storage or a file sharing service"'::jsonb, 5),
  (dig_id, 'When using a video conferencing tool for a professional meeting, what is good practice?', 'digital', 'communication', 3, 'multiple_choice', '["Leave your camera off the entire time","Use an appropriate background, test audio and video beforehand, and mute when not speaking","Join from a noisy public place","Eat meals during the meeting"]'::jsonb, '"Use an appropriate background, test audio and video beforehand, and mute when not speaking"'::jsonb, 6),
  (dig_id, 'You receive a work email marked URGENT from an unknown sender with an attachment. What should you do?', 'digital', 'communication', 3, 'multiple_choice', '["Reply immediately with all your personal details","Open all attachments to see what they want","Delete it without looking","Report it to your IT team or manager and do not click any links or open attachments"]'::jsonb, '"Report it to your IT team or manager and do not click any links or open attachments"'::jsonb, 7),
  (dig_id, 'What is the main purpose of the ''reply all'' function in email?', 'digital', 'communication', 3, 'multiple_choice', '["To forward the email to new people","To send your reply to everyone who received the original email","To delete the email","To mark the email as important"]'::jsonb, '"To send your reply to everyone who received the original email"'::jsonb, 8),

  -- INFORMATION LITERACY
  (dig_id, 'You find information on a website. What should you consider before trusting it?', 'digital', 'information_literacy', 3, 'multiple_choice', '["The colour of the website","Whether the information is current, the source is credible and the site has no clear bias","How many images are on the page","Whether the website has a social media link"]'::jsonb, '"Whether the information is current, the source is credible and the site has no clear bias"'::jsonb, 9),
  (dig_id, 'You need to search for information online about a topic. Which approach is most effective?', 'digital', 'information_literacy', 3, 'multiple_choice', '["Click the first result without reading it","Type a detailed search query, use multiple sources and compare the information","Only use one website and accept its information","Search for ''everything about [topic]''"]'::jsonb, '"Type a detailed search query, use multiple sources and compare the information"'::jsonb, 10),
  (dig_id, 'What is the difference between ''.gov.au'' and ''.com.au'' website addresses?', 'digital', 'information_literacy', 3, 'multiple_choice', '[".gov.au sites are always more reliable",".gov.au sites are Australian government websites; .com.au sites are commercial businesses","There is no difference",".com.au sites are more trustworthy"]'::jsonb, '".gov.au sites are Australian government websites; .com.au sites are commercial businesses"'::jsonb, 11),
  (dig_id, 'You want to use an image found online in a work presentation. What should you consider?', 'digital', 'information_literacy', 3, 'multiple_choice', '["Nothing – all images online are free to use","Whether the image has a copyright licence that allows the use you intend","The resolution of the image only","Whether the image looks nice"]'::jsonb, '"Whether the image has a copyright licence that allows the use you intend"'::jsonb, 12),

  -- ONLINE SAFETY
  (dig_id, 'Which of the following is a strong password?', 'digital', 'online_safety', 3, 'multiple_choice', '["password123","MyDogRex","J9#mK2@pLq!8","12345678"]'::jsonb, '"J9#mK2@pLq!8"'::jsonb, 13),
  (dig_id, 'What is ''phishing''?', 'digital', 'online_safety', 3, 'multiple_choice', '["A type of computer virus","A technique to speed up computers","An attempt to trick people into revealing personal information, usually through fake emails or websites","A method to improve internet connection speed"]'::jsonb, '"An attempt to trick people into revealing personal information, usually through fake emails or websites"'::jsonb, 14),
  (dig_id, 'You are using public Wi-Fi at a café. What should you be cautious about?', 'digital', 'online_safety', 3, 'multiple_choice', '["Nothing – public Wi-Fi is always secure","Your personal data may be at risk on unsecured networks; avoid accessing sensitive accounts","Public Wi-Fi always improves your internet speed","Public Wi-Fi is faster than home internet"]'::jsonb, '"Your personal data may be at risk on unsecured networks; avoid accessing sensitive accounts"'::jsonb, 15),
  (dig_id, 'What does ''two-factor authentication'' (2FA) provide?', 'digital', 'online_safety', 3, 'multiple_choice', '["Slower login speed","A second layer of security by requiring an additional verification step beyond your password","A way to share your password with someone else","A way to reset your password"]'::jsonb, '"A second layer of security by requiring an additional verification step beyond your password"'::jsonb, 16),

  -- PROBLEM SOLVING
  (dig_id, 'You are working on a document and the program stops responding. What should you do first?', 'digital', 'problem_solving', 3, 'multiple_choice', '["Immediately turn off the computer","Wait a few moments to see if it recovers, then try saving your work","Close all programs without saving","Delete the document"]'::jsonb, '"Wait a few moments to see if it recovers, then try saving your work"'::jsonb, 17),
  (dig_id, 'A colleague sends you a file and you cannot open it. What is the most likely reason and solution?', 'digital', 'problem_solving', 3, 'multiple_choice', '["The file is too good to open","The file may be in a format not supported by your software; try a different program or ask the sender to resave in a compatible format","Your computer is broken","The file is too small to open"]'::jsonb, '"The file may be in a format not supported by your software; try a different program or ask the sender to resave in a compatible format"'::jsonb, 18),
  (dig_id, 'You are trying to complete an online form but keep receiving an error message. What should you try first?', 'digital', 'problem_solving', 3, 'multiple_choice', '["Give up and call the organisation","Clear your browser cache/cookies and try again, or try a different browser","Restart your router","Accept that the task is impossible"]'::jsonb, '"Clear your browser cache/cookies and try again, or try a different browser"'::jsonb, 19),
  (dig_id, 'Your work system requires you to change your password every 90 days. Why is this practice important?', 'digital', 'problem_solving', 3, 'multiple_choice', '["It makes it easier to forget your password","Regular password changes reduce the risk of unauthorised access if a password has been compromised","It helps the IT team remember your password","It is only done to annoy staff"]'::jsonb, '"Regular password changes reduce the risk of unauthorised access if a password has been compromised"'::jsonb, 20);

  -- ── Update total_questions counts ─────────────────────────────────────────
  UPDATE assessments
  SET total_questions = (SELECT COUNT(*) FROM assessment_questions WHERE assessment_id = lln_id)
  WHERE id = lln_id;

  UPDATE assessments
  SET total_questions = (SELECT COUNT(*) FROM assessment_questions WHERE assessment_id = dig_id)
  WHERE id = dig_id;

  -- ── Version history snapshots ─────────────────────────────────────────────
  INSERT INTO assessment_version_history (assessment_id, version, change_summary, snapshot)
  VALUES
    (lln_id, '1.0.0', 'Initial release — migrated from hardcoded TypeScript question arrays', '{"source":"migration","questions":75}'::jsonb),
    (dig_id, '1.0.0', 'Initial release — migrated from hardcoded TypeScript question arrays', '{"source":"migration","questions":21}'::jsonb);

  -- ── Backfill invitation_assessments for existing invitations ──────────────
  -- LLN backfill
  INSERT INTO invitation_assessments
    (invitation_id, assessment_id, individual_status, individual_score, individual_passed, individual_completed_at, acsf_outcomes)
  SELECT
    ai.id,
    lln_id,
    CASE WHEN (ai.lln_status::text) = 'completed' THEN 'completed'
         WHEN (ai.lln_status::text) = 'in_progress' THEN 'in_progress'
         ELSE 'pending' END,
    NULL,
    NULL,
    (ai.lln_completed_at::timestamptz),
    COALESCE((ai.lln_acsf_outcomes::jsonb), '{}'::jsonb)
  FROM assessment_invitations ai
  WHERE (ai.lln_token::text) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM invitation_assessments ia2
      WHERE ia2.invitation_id = ai.id AND ia2.assessment_id = lln_id
    );

  -- Digital backfill
  INSERT INTO invitation_assessments
    (invitation_id, assessment_id, individual_status, individual_score, individual_passed, individual_completed_at, acsf_outcomes)
  SELECT
    ai.id,
    dig_id,
    CASE WHEN (ai.digital_status::text) = 'completed' THEN 'completed'
         WHEN (ai.digital_status::text) = 'in_progress' THEN 'in_progress'
         ELSE 'pending' END,
    (ai.digital_score::numeric),
    CASE WHEN (ai.digital_score::numeric) >= 50 THEN true ELSE false END,
    (ai.digital_completed_at::timestamptz),
    '{}'::jsonb
  FROM assessment_invitations ai
  WHERE (ai.digital_token::text) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM invitation_assessments ia2
      WHERE ia2.invitation_id = ai.id AND ia2.assessment_id = dig_id
    );

END;
$migration$;
