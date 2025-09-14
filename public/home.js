// Initialize AOS
AOS.init({
  duration: 800,
  easing: 'ease-in-out',
  once: true
});

// Initialize Feather Icons after DOM and script load
document.addEventListener('DOMContentLoaded', function () {
  if (window.feather && typeof window.feather.replace === 'function') {
    window.feather.replace();
  }

  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const targetEl = document.querySelector(targetId);
      if (!targetEl) return;
      e.preventDefault();
      targetEl.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Add active class to nav items on scroll
  const sections = document.querySelectorAll('section[id]');
  const navItems = document.querySelectorAll('.navbar-nav .nav-link');

  const onScroll = () => {
    let current = '';
    const scrollY = window.pageYOffset;

    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (scrollY >= sectionTop - 300 && scrollY < sectionTop + sectionHeight - 300) {
        current = section.getAttribute('id');
      }
    });

    navItems.forEach(item => {
      item.classList.remove('active');
      const href = item.getAttribute('href');
      if (href && href === `#${current}`) {
        item.classList.add('active');
      }
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // set initial state
});


//for page 2
feather.replace();

        const nameSection = document.getElementById('name-section');
        const ageSection = document.getElementById('age-section');
        const progressBar = document.getElementById('progress-bar');
        const userNameInput = document.getElementById('userName');

        function showAgeSection() {
            const userName = userNameInput.value;
            if (userName.trim() === '') {
                alert('Please enter your name.');
                return;
            }
            nameSection.classList.add('d-none');
            ageSection.classList.remove('d-none');
            progressBar.style.width = '50%';
        }

        function submitInfo() {
            const userName = userNameInput.value;
            const userAge = document.getElementById('userAge').value;
            if (userAge.trim() === '') {
                alert('Please enter your age.');
                return;
            }
            progressBar.style.width = '100%';
            
            // Simulating a delay for a more realistic "loading" feel
            setTimeout(() => {
                alert(`Hello, ${userName}! Your age is ${userAge}. We've received your information!`);
                // You can add a redirect or further actions here
            }, 500);
        }


        ///page 3

         AOS.init({
            duration: 800,
            easing: 'ease-in-out',
            once: true
        });

        feather.replace();
        
        let selectedGoal = null;
        
        function selectGoal(card, goal) {
            // Remove 'selected' class from all cards
            document.querySelectorAll('.goal-card').forEach(c => {
                c.classList.remove('selected');
            });
            // Add 'selected' class to the clicked card
            card.classList.add('selected');
            selectedGoal = goal;
            
            // Log the selected goal and prepare for the next page
            console.log("Selected goal: " + selectedGoal);
            
            // Placeholder for navigation to the next page
            // window.location.href = 'next-page.html?goal=' + encodeURIComponent(selectedGoal);
        }
  ///page 4
  AOS.init({
            duration: 800,
            easing: 'ease-in-out',
            once: true
        });

        feather.replace();

        let selectedLevel = null;

        function selectLevel(card, level) {
            // Remove 'selected' class from all cards
            document.querySelectorAll('.level-card').forEach(c => {
                c.classList.remove('selected');
            });
            // Add 'selected' class to the clicked card
            card.classList.add('selected');
            selectedLevel = level;

            // Log the selected level and prepare for the next page
            console.log("Selected fitness level: " + selectedLevel);

            // Placeholder for navigation to the next page
            // window.location.href = 'next-page.html?level=' + encodeURIComponent(selectedLevel);
        }

        // page5

        AOS.init({
            duration: 800,
            easing: 'ease-in-out',
            once: true
        });
        feather.replace();

        function saveHealthInfo() {
            const healthInfo = document.getElementById('healthImplications').value.trim();
            
            // This is where you would save or process the health information.
            // You can pass this to your Gemini API for a more customized plan.
            console.log("User's health implications: " + (healthInfo || "None specified"));
            
            // Placeholder for next page redirection
            alert("Thank you! Your information has been saved. We'll use this to create a safe workout for you.");
            // window.location.href = 'next-page.html?health=' + encodeURIComponent(healthInfo);
        }

// page6
function saveEquipment() {
    const equipment = document.getElementById('equipmentInput').value.trim();
    // This is where you would send the data to your Gemini API
    console.log("User's equipment: " + (equipment || "None specified"));

    // Placeholder for next page redirection
    alert("Information saved! Proceeding to the next step.");
    // window.location.href = 'next-page.html?equipment=' + encodeURIComponent(equipment);
}

function skipEquipment() {
    console.log("User has no equipment.");
    // Placeholder for next page redirection
    alert("Okay, we'll create a workout for you with no equipment!");
    // window.location.href = 'next-page.html?equipment=none';
}

///page7
AOS.init({
    duration: 800,
    easing: 'ease-in-out',
    once: true
});
feather.replace();

function saveDuration() {
    const duration = document.getElementById('workoutDuration').value;
    if (duration < 5) {
        alert("Please enter a duration of at least 5 minutes.");
        return;
    }

    console.log("User's desired workout duration: " + duration + " minutes");
    
    // This is the final step before calling the API. You can now collect all previous data:
    // - Name & Age
    // - Fitness Goal
    // - Fitness Level
    // - Equipment
    // - Health Implications
    // - Workout Duration
    
    alert("All information collected. We're now generating your custom workout!");
    // This is where you'd make the API call to Gemini with all the collected data.
    // A loading state can be added here.
}

///outpiut page\\
     feather.replace();
        AOS.init({
            duration: 800,
            easing: 'ease-in-out',
            once: true
        });

        // Example data - this would come from your Gemini API call
        const sampleWorkoutData = [
            {
                title: "Dynamic Warm-up",
                steps: [
                    "30 sec Arm Circles",
                    "30 sec High Knees (low intensity)"
                ],
                duration: 1,
                image: "https://hips.hearstapps.com/hmg-prod/images/mh-bodyweight-warmup-1555519106.gif" 
            },
            {
                title: "Main Circuit (Repeat 2 rounds)",
                steps: [
                    "Jump Squats – 40 sec → rest 20 sec",
                    "Mountain Climbers – 40 sec → rest 20 sec",
                    "Push-ups – 40 sec → rest 20 sec",
                    "Skater Jumps – 40 sec → rest 20 sec",
                    "Plank with Shoulder Taps – 40 sec → rest 20 sec"
                ],
                duration: 8,
                image: "https://i.pinimg.com/originals/a1/7f/73/a17f7300c8f1d3e11a68cebb0281b37d.gif" 
            },
            {
                title: "Cool-down & Flexibility",
                steps: [
                    "30 sec Standing Quad Stretch (each side)",
                    "30 sec Hamstring stretch (each side)",
                ],
                duration: 1,
                image: "https://i.pinimg.com/originals/56/67/97/56679774a9557b4943f728fb562c11ee.gif" 
            }
        ];

        document.addEventListener('DOMContentLoaded', () => {
            renderWorkouts(sampleWorkoutData);
        });


        function renderWorkouts(workouts) {
    const container = document.getElementById('workouts-container');
    container.innerHTML = ''; // Clear previous workouts if any

    workouts.forEach(workout => {
        const workoutDiv = document.createElement('div');
        workoutDiv.classList.add('workout-section');

        const workoutDetails = document.createElement('div');
        workoutDetails.classList.add('workout-details');

        const title = document.createElement('h4');
        title.textContent = workout.title;
        workoutDetails.appendChild(title);

        const stepsList = document.createElement('ul');
        workout.steps.forEach(step => {
            const listItem = document.createElement('li');
            listItem.textContent = step;
            stepsList.appendChild(listItem);
        });
        workoutDetails.appendChild(stepsList);

        const durationText = document.createElement('p');
        durationText.classList.add('duration-text');
        durationText.innerHTML = `Duration: Approximately <strong>${workout.duration}</strong> minutes`;
        workoutDetails.appendChild(durationText);

        workoutDiv.appendChild(workoutDetails);

        // Add image container if an image URL is provided
        if (workout.image) {
            const imageContainer = document.createElement('div');
            imageContainer.classList.add('workout-image-container');
            const img = document.createElement('img');
            img.src = workout.image;
            img.alt = `Image for ${workout.title}`;
            imageContainer.appendChild(img);
            workoutDiv.appendChild(imageContainer);
        }

        container.appendChild(workoutDiv);
    });

    // Update the total workout time display
    const totalDuration = workouts.reduce((sum, workout) => sum + workout.duration, 0);
    document.getElementById('workoutTime').textContent = totalDuration;
}

// Function to simulate generating a new workout (for demonstration purposes)
function generateNewWorkout() {
    alert("Generating a new workout... (In a real application, this would call your API with user data)");
    
    setTimeout(() => {
        renderWorkouts(sampleWorkoutData);
        AOS.refresh();
    }, 800); 
}


///nodemailer

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "lochanawasthi22@gmail.com", // any Gmail account
    pass: "coqu zgna vsyb cuew", // generated from Google Security → App passwords
  },
});

// 1️⃣ Notify site owner
  transporter.sendMail(
    {
      from: "lochanawasthi22@gmail.com",       // must match auth.user
      to: "studioOwner@gmail.com",             // replace with your own inbox
      subject: "📸 New Booking Request",
      text: `${newReview.name} wants to book a ${newReview.session} session.
             Contact: ${newReview.email}, ${newReview.phone}`,
    },
    (err, info) => {
      if (err) {
        console.error("❌ Error sending owner email:", err);
      } else {
        console.log("✅ Owner email sent:", info.response);
      }
    }
  );

  // 2️⃣ Confirmation back to the client
  transporter.sendMail(
    {
      from: "lochanawasthi22@gmail.com",
      to: newReview.email,                    // client’s email from form
      subject: "✅ Thanks for booking with Astryne Studio",
      text: `Hi ${newReview.name}, thanks for booking a ${newReview.session} session.
             We’ll get back to you soon!`,
    },
    (err, info) => {
      if (err) {
        console.error("❌ Error sending confirmation:", err);
      } else {
        console.log("✅ Confirmation email sent to client:", info.response);
      }
    }
  );