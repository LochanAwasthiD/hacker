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

